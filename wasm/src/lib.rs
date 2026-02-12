use wasm_bindgen::prelude::*;

// ─── Tile byte encoding (matches tileGrid.ts) ───
// 0x00-0x07 : Opened, 0-7 adjacent mines
// 0x08      : Bomb
// 0x10-0x11 : Closed (checker 0/1)
// 0x20-0x27 : Flags (color 0-3, checker 0/1)
// 0xFF      : Fill / Uninitialized

const TILE_FILL: u8 = 0xFF;

// ─── Hex nibble LUT (charCode → 0-15, 0xFF for invalid) ───
static HEX_LUT: [u8; 128] = {
    let mut lut = [0xFFu8; 128];
    let mut i = 0u8;
    // '0'-'9' → 0-9
    while i < 10 {
        lut[(b'0' + i) as usize] = i;
        i += 1;
    }
    // 'A'-'F' → 10-15
    i = 0;
    while i < 6 {
        lut[(b'A' + i) as usize] = 10 + i;
        i += 1;
    }
    // 'a'-'f' → 10-15
    i = 0;
    while i < 6 {
        lut[(b'a' + i) as usize] = 10 + i;
        i += 1;
    }
    lut
};

/// Decode server hex byte (2 hex chars → 1 byte) into our TileGrid encoding.
#[inline(always)]
fn decode_hex_pair(c0: u8, c1: u8) -> u8 {
    let n0 = if (c0 as usize) < 128 { HEX_LUT[c0 as usize] } else { 0xFF };
    let n1 = if (c1 as usize) < 128 { HEX_LUT[c1 as usize] } else { 0xFF };
    if n0 == 0xFF || n1 == 0xFF {
        return TILE_FILL; // invalid hex
    }
    let byte = (n0 << 4) | n1;
    server_byte_to_tile(byte)
}

/// Convert a raw server byte (the decoded hex value) into our TileGrid encoding.
/// Server protocol:
///   bit 7: opened
///   bit 6: mine
///   bit 5: flag
///   bits 4-3: color (0-3)
///   bits 2-0: number (0-7)
#[inline(always)]
fn server_byte_to_tile(byte: u8) -> u8 {
    let is_opened = (byte & 0b1000_0000) != 0;
    let is_mine   = (byte & 0b0100_0000) != 0;
    let is_flag   = (byte & 0b0010_0000) != 0;
    let color     = (byte & 0b0001_1000) >> 3;
    let number    = byte & 0b0000_0111;

    if is_opened {
        if is_mine { 0x08 } else { number } // 0-7 or BOMB(8)
    } else if is_flag {
        0x20 | (color << 1) // checker bit added later
    } else {
        0x10 // closed, checker bit added later
    }
}

// ─── Result encoding ───
// Changes are packed into a u32 array: each entry = (row << 16) | (col << 8) | value
// This avoids JS object allocation overhead.

/// Process hex-encoded tile data from the server and compute diff against existing grid.
///
/// # Arguments
/// * `hex_data`     - The raw hex string bytes from server (2 chars per tile)
/// * `existing`     - Current TileGrid.data (flat Uint8Array)
/// * `grid_width`   - TileGrid width
/// * `grid_height`  - TileGrid height
/// * `end_x`        - Inner end X (server range)
/// * `end_y`        - End Y (server range)
/// * `start_x`      - Inner start X (server range)
/// * `start_y`      - Start Y (server range)
/// * `start_point_x`- currentStartPoint.x
/// * `start_point_y`- currentStartPoint.y
/// * `is_all`       - Whether this is a full (All) update
///
/// # Returns
/// A packed `Vec<u32>` where each element = `(row << 16) | (col << 8) | value`
#[wasm_bindgen]
pub fn process_hex_tiles(
    hex_data: &[u8],
    existing: &[u8],
    grid_width: u32,
    grid_height: u32,
    end_x: i32,
    end_y: i32,
    start_x: i32,
    start_y: i32,
    start_point_x: i32,
    start_point_y: i32,
    is_all: bool,
) -> Vec<u32> {
    let tiles_per_row = (end_x - start_x + 1).unsigned_abs() as usize;
    let row_length_bytes = tiles_per_row * 2;
    let column_length = (start_y - end_y + 1).unsigned_abs() as usize;

    let y_offset = end_y - start_point_y;
    let x_offset: i32 = if is_all { 0 } else { start_x - start_point_x - 1 };

    let gw = grid_width as usize;
    let gh = grid_height as usize;

    let total_tiles = column_length * tiles_per_row;
    let mut changes: Vec<u32> = Vec::with_capacity(total_tiles / 4); // estimate ~25% change rate

    for tile_index in 0..total_tiles {
        let row_index = tile_index / tiles_per_row;
        let col_index = tile_index % tiles_per_row;

        let reversed_i = column_length - 1 - row_index;
        let row = reversed_i as i32 + y_offset;

        if row < 0 || (row as usize) >= gh { continue; }
        if gw == 0 { continue; }

        let y_abs = end_y - reversed_i as i32;

        let t_start = 0i32.max(-x_offset) as usize;
        let t_end = (tiles_per_row as i32).min(gw as i32 - x_offset) as usize;
        if col_index < t_start || col_index >= t_end { continue; }

        let byte_offset = row_index * row_length_bytes + col_index * 2;
        if byte_offset + 1 >= hex_data.len() { continue; }

        let c0 = hex_data[byte_offset];
        let c1 = hex_data[byte_offset + 1];
        let tile_type_raw = decode_hex_pair(c0, c1);

        if tile_type_raw == TILE_FILL { continue; }

        let col = col_index as i32 + x_offset;
        let checker = ((col + y_abs + start_point_x) & 1) as u8;

        // Apply checkerboard bit to closed/flag tiles
        let value = if tile_type_raw >= 0x10 {
            tile_type_raw | checker
        } else {
            tile_type_raw
        };

        let row_u = row as usize;
        let col_u = col as usize;
        let idx = row_u * gw + col_u;

        if idx < existing.len() && existing[idx] != value {
            changes.push(((row_u as u32) << 16) | ((col_u as u32) << 8) | (value as u32));
        }
    }

    changes
}

/// Process hex-encoded tile data and write directly into the grid (inplace).
/// Avoids packed-change vector allocation and JS-side unpack loop.
/// The `grid` parameter uses wasm_bindgen's &mut [u8] which copies in and writes back.
///
/// # Returns
/// Number of tiles that were changed.
#[wasm_bindgen]
pub fn process_hex_tiles_inplace(
    hex_data: &[u8],
    grid: &mut [u8],
    grid_width: u32,
    grid_height: u32,
    end_x: i32,
    end_y: i32,
    start_x: i32,
    start_y: i32,
    start_point_x: i32,
    start_point_y: i32,
    is_all: bool,
) -> u32 {
    let tiles_per_row = (end_x - start_x + 1).unsigned_abs() as usize;
    let row_length_bytes = tiles_per_row * 2;
    let column_length = (start_y - end_y + 1).unsigned_abs() as usize;

    let y_offset = end_y - start_point_y;
    let x_offset: i32 = if is_all { 0 } else { start_x - start_point_x - 1 };

    let gw = grid_width as usize;
    let gh = grid_height as usize;

    let total_tiles = column_length * tiles_per_row;
    let mut change_count: u32 = 0;

    for tile_index in 0..total_tiles {
        let row_index = tile_index / tiles_per_row;
        let col_index = tile_index % tiles_per_row;

        let reversed_i = column_length - 1 - row_index;
        let row = reversed_i as i32 + y_offset;

        if row < 0 || (row as usize) >= gh { continue; }
        if gw == 0 { continue; }

        let y_abs = end_y - reversed_i as i32;

        let t_start = 0i32.max(-x_offset) as usize;
        let t_end = (tiles_per_row as i32).min(gw as i32 - x_offset) as usize;
        if col_index < t_start || col_index >= t_end { continue; }

        let byte_offset = row_index * row_length_bytes + col_index * 2;
        if byte_offset + 1 >= hex_data.len() { continue; }

        let c0 = hex_data[byte_offset];
        let c1 = hex_data[byte_offset + 1];
        let tile_type_raw = decode_hex_pair(c0, c1);

        if tile_type_raw == TILE_FILL { continue; }

        let col = col_index as i32 + x_offset;
        let checker = ((col + y_abs + start_point_x) & 1) as u8;

        let value = if tile_type_raw >= 0x10 {
            tile_type_raw | checker
        } else {
            tile_type_raw
        };

        let row_u = row as usize;
        let col_u = col as usize;
        let idx = row_u * gw + col_u;

        if idx < grid.len() && grid[idx] != value {
            grid[idx] = value;
            change_count += 1;
        }
    }

    change_count
}

/// Process binary tile data (1 byte per tile, from server) and compute diff.
/// Same as process_hex_tiles but input is already decoded (1 byte = 1 server tile).
/// Uses SIMD (simd128) when building for wasm32 to process 16 tiles at a time.
#[wasm_bindgen]
pub fn process_binary_tiles(
    binary_data: &[u8],
    existing: &[u8],
    grid_width: u32,
    grid_height: u32,
    end_x: i32,
    end_y: i32,
    start_x: i32,
    start_y: i32,
    start_point_x: i32,
    start_point_y: i32,
    is_all: bool,
) -> Vec<u32> {
    let tiles_per_row = (end_x - start_x + 1).unsigned_abs() as usize;
    let column_length = (start_y - end_y + 1).unsigned_abs() as usize;

    let y_offset = end_y - start_point_y;
    let x_offset: i32 = if is_all { 0 } else { start_x - start_point_x - 1 };

    let gw = grid_width as usize;
    let gh = grid_height as usize;

    let total_tiles = column_length * tiles_per_row;
    let mut changes: Vec<u32> = Vec::with_capacity(total_tiles / 4);

    let mut tile_index: usize = 0;
    while tile_index < total_tiles {
        let row_index = tile_index / tiles_per_row;
        let col_index = tile_index % tiles_per_row;

        let reversed_i = column_length - 1 - row_index;
        let row = reversed_i as i32 + y_offset;

        if row < 0 || (row as usize) >= gh {
            tile_index += 1;
            continue;
        }
        if gw == 0 {
            tile_index += 1;
            continue;
        }

        let y_abs = end_y - reversed_i as i32;

        let t_start = 0i32.max(-x_offset) as usize;
        let t_end = (tiles_per_row as i32).min(gw as i32 - x_offset) as usize;
        if col_index < t_start || col_index >= t_end {
            tile_index += 1;
            continue;
        }

        let chunk_size = (t_end - col_index).min(16);
        let use_simd = chunk_size == 16
            && tile_index + 16 <= binary_data.len()
            && {
                let row_u = row as usize;
                let col_u_start = col_index as i32 + x_offset;
                (row_u * gw + (col_u_start as usize) + 16) <= existing.len()
            };

        #[cfg(target_arch = "wasm32")]
        if use_simd {
            let row_u = row as usize;
            let col_u_start = (col_index as i32 + x_offset) as usize;
            let existing_offset = row_u * gw + col_u_start;

            let mut bin_buf = [0u8; 16];
            bin_buf.copy_from_slice(&binary_data[tile_index..tile_index + 16]);
            let mut ex_buf = [0u8; 16];
            ex_buf.copy_from_slice(&existing[existing_offset..existing_offset + 16]);

            let base_checker = ((col_index as i32 + y_abs + start_point_x) & 1) as u8;

            unsafe {
                process_binary_chunk_simd(
                    &bin_buf,
                    &ex_buf,
                    row_u,
                    col_u_start,
                    base_checker,
                    &mut changes,
                );
            }
            tile_index += 16;
            continue;
        }

        for lane in 0..chunk_size {
            let ti = tile_index + lane;
            if ti >= binary_data.len() {
                break;
            }

            let server_byte = binary_data[ti];
            let tile_type_raw = server_byte_to_tile(server_byte);

            if tile_type_raw == TILE_FILL {
                continue;
            }

            let col = (col_index + lane) as i32 + x_offset;
            let checker = ((col + y_abs + start_point_x) & 1) as u8;

            let value = if tile_type_raw >= 0x10 {
                tile_type_raw | checker
            } else {
                tile_type_raw
            };

            let row_u = row as usize;
            let col_u = col as usize;
            let idx = row_u * gw + col_u;

            if idx < existing.len() && existing[idx] != value {
                changes.push(((row_u as u32) << 16) | ((col_u as u32) << 8) | (value as u32));
            }
        }
        tile_index += chunk_size;
    }

    changes
}

#[repr(align(16))]
struct Align16([u8; 16]);

#[cfg(target_arch = "wasm32")]
#[inline(always)]
unsafe fn process_binary_chunk_simd(
    binary_chunk: &[u8; 16],
    existing_chunk: &[u8; 16],
    row_u: usize,
    col_u_start: usize,
    base_checker: u8,
    changes: &mut Vec<u32>,
) {
    use core::arch::wasm32::*;

    let zero = i8x16_splat(0);
    let b = v128_load(binary_chunk.as_ptr() as *const v128);

    let mask_opened = i8x16_ne(v128_and(b, i8x16_splat(0x80u8 as i8)), zero);
    let mask_mine = i8x16_ne(v128_and(b, i8x16_splat(0x40)), zero);
    let mask_flag = i8x16_ne(v128_and(b, i8x16_splat(0x20)), zero);
    let number = v128_and(b, i8x16_splat(0x07));
    let color = v128_and(i8x16_shr(b, 3), i8x16_splat(0x03));
    let flag_val = v128_or(i8x16_splat(0x20), i8x16_shl(color, 1));

    let opened_result = v128_bitselect(i8x16_splat(0x08), number, mask_mine);
    let closed_result = v128_bitselect(flag_val, i8x16_splat(0x10), mask_flag);
    let value_raw = v128_bitselect(closed_result, opened_result, mask_opened);

    let one = i8x16_splat(1);
    let lane_idx = i8x16(
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    );
    let checker_add = i8x16_add(i8x16_splat(base_checker as i8), lane_idx);
    let checker_vec = v128_and(checker_add, one);
    let mask_ge = i8x16_ge(value_raw, i8x16_splat(0x10));
    let checker_to_apply = v128_and(checker_vec, mask_ge);
    let value_final = v128_or(value_raw, checker_to_apply);

    let existing_vec = v128_load(existing_chunk.as_ptr() as *const v128);
    let mask_ne = i8x16_ne(value_final, existing_vec);

    if i8x16_bitmask(mask_ne) == 0 {
        return;
    }

    let mut value_buf = Align16([0u8; 16]);
    let mut mask_buf = Align16([0u8; 16]);
    v128_store(value_buf.0.as_mut_ptr() as *mut v128, value_final);
    v128_store(mask_buf.0.as_mut_ptr() as *mut v128, mask_ne);

    for i in 0..16 {
        if mask_buf.0[i] != 0 {
            let col_u = col_u_start + i;
            changes.push(((row_u as u32) << 16) | ((col_u as u32) << 8) | (value_buf.0[i] as u32));
        }
    }
}

/// Unpack a packed change entry into (row, col, value).
/// Utility for testing/debugging from JS.
#[wasm_bindgen]
pub fn unpack_change(packed: u32) -> Vec<u32> {
    vec![
        (packed >> 16) & 0xFFFF,
        (packed >> 8) & 0xFF,
        packed & 0xFF,
    ]
}
