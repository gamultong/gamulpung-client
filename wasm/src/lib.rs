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

/// Process binary tile data (1 byte per tile, from server) and compute diff.
/// Same as process_hex_tiles but input is already decoded (1 byte = 1 server tile).
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

        if tile_index >= binary_data.len() { continue; }

        let server_byte = binary_data[tile_index];
        let tile_type_raw = server_byte_to_tile(server_byte);

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

        if idx < existing.len() && existing[idx] != value {
            changes.push(((row_u as u32) << 16) | ((col_u as u32) << 8) | (value as u32));
        }
    }

    changes
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
