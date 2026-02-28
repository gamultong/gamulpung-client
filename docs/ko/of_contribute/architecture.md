# 프로젝트 아키텍처

## 기술 스택

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| 프레임워크 | Next.js | 14.x | App Router 기반 SSR/SSG |
| UI | React | 18.x | 컴포넌트 기반 UI |
| 렌더링 | Pixi.js | 7.x | WebGL 기반 2D 타일 렌더링 |
| 렌더링 바인딩 | @pixi/react | 7.x | React-Pixi 통합 |
| 상태 관리 | Zustand | 5.x | 경량 전역 상태 |
| 그래프 시각화 | @xyflow/react | 12.x | 스킬 트리 / 사이트맵 |
| 마크다운 | Showdown | 2.x | 문서 페이지 렌더링 |
| 스타일 | SASS | 1.x | SCSS 모듈 |
| 타일 처리 | WASM (Rust) | — | 고성능 hex→타일 변환 |

---

## 디렉토리 구조

```
src/
├── app/                    # Next.js 페이지
│   ├── page.tsx            # 홈 (랜딩 페이지)
│   ├── layout.tsx          # 루트 레이아웃
│   ├── play/               # 게임 페이지
│   │   ├── page.tsx        # 게임 오케스트레이터
│   │   ├── layout.tsx      # 플레이 레이아웃
│   │   └── constants.ts    # RENDER_RANGE, WS_URL 등 상수
│   ├── documents/          # 문서 페이지
│   ├── robots.ts           # SEO robots.txt
│   └── sitemap.ts          # 사이트맵 XML
│
├── components/             # React 컴포넌트
│   ├── canvas/             # 캔버스 오케스트레이터
│   ├── tilemap/            # Pixi.js 타일 렌더러
│   ├── canvasDashboard/    # 줌/통계 UI
│   ├── skilltree/          # 스킬 트리 (ReactFlow)
│   ├── chat/               # 채팅 오버레이
│   ├── scoreboard/         # 랭킹 표시
│   ├── inactive/           # 부활 카운트다운
│   └── ...
│
├── hooks/                  # 커스텀 훅
│   ├── useMessageHandler   # WebSocket 메시지 라우팅
│   ├── useTileProcessing   # hex → Uint8Array 변환
│   ├── useTileViewport     # 뷰포트 계산 + SET_WINDOW
│   ├── useInputHandlers    # 마우스/터치 입력
│   ├── useMovement         # A* 경로탐색 + 커서 애니메이션
│   ├── useCursorRenderer   # 커서/경로 Canvas 2D 렌더링
│   ├── useExplosionManager # 폭발 상태 관리
│   ├── useShockwaveAnimation # 폭발 애니메이션 (RAF)
│   ├── useSkillTree        # 스킬 트리 로직
│   ├── useTilemapTextures  # Pixi 텍스처 생성/캐싱
│   └── useScreenSize       # 윈도우 크기 추적
│
├── store/                  # Zustand 상태 저장소
│   ├── websocketStore      # WebSocket 연결 상태
│   ├── tileStore           # 타일 그리드 + 뷰 바운드
│   ├── cursorStore         # 커서 위치/줌/점수
│   ├── interactionStore    # 클릭 위치/애니메이션
│   ├── skillTreeStore      # 구매한 스킬 목록
│   └── rankingStore        # 리더보드
│
├── utils/                  # 유틸리티
│   ├── tileGrid.ts         # TileGrid 클래스 (Uint8Array)
│   ├── tileCache.ts        # 월드 좌표 기반 LRU 캐시
│   ├── wasmTileEngine.ts   # WASM 모듈 로더
│   ├── tiles.ts            # Hex 파싱 LUT (벡터화)
│   ├── aStar.ts            # A* 경로탐색 알고리즘
│   ├── pixiSpritePool.ts   # 스프라이트 오브젝트 풀
│   ├── canvas.ts           # Canvas 드로잉 헬퍼
│   └── makePath2d.ts       # SVG → Path2D 변환
│
├── types/                  # TypeScript 타입 정의
│   ├── message.ts          # WebSocket 프로토콜 타입
│   ├── canvas.ts           # 렌더링 타입
│   ├── position.ts         # 좌표/방향 타입
│   └── ...
│
├── constants/              # 전역 상수
│   └── cursor.ts           # 커서 색상, 8방향 오프셋
│
├── assets/                 # SVG 벡터 경로
│   └── renderPaths.json    # 타일/커서/깃발/폭탄 벡터
│
└── wasm-pkg/               # WASM 바인딩 (Rust 컴파일)
    └── minesweeper_tile_engine.wasm
```

---

## Zustand 상태 관리 구조

```
┌──────────────────────────────────────┐
│          Zustand Stores              │
├──────────────────────────────────────┤
│ websocketStore  → 소켓, 메시지 버퍼    │
│ tileStore       → 타일 그리드, 뷰 바운드 │
│ cursorStore     → 위치, 줌, 점수, 아이템 │
│ interactionStore→ 클릭, 애니메이션      │
│ skillTreeStore  → 구매 스킬            │
│ rankingStore    → 랭킹 데이터          │
└──────────────────────────────────────┘
       ↑ (setter)          ↓ (selector)
   Hooks/이벤트         React 컴포넌트
```

**단방향 데이터 흐름:**
1. WebSocket 이벤트 → `useMessageHandler`가 store 상태 읽기
2. Store setter 호출 (예: `applyTileChanges`)
3. 구독 중인 컴포넌트가 리렌더
4. 컴포넌트에서 최신 store 상태 읽기

---

## 모듈별 역할 요약

### Hooks

| 훅 | 책임 |
|----|------|
| `useMessageHandler` | 수신 WebSocket 메시지를 이벤트별로 라우팅하여 처리 |
| `useTileProcessing` | hex 인코딩된 타일 데이터를 TileGrid(Uint8Array)로 변환 (WASM 우선, JS 폴백) |
| `useTileViewport` | 뷰포트 크기 기반으로 시작/종료 지점 계산, SET_WINDOW 디바운스 전송 |
| `useInputHandlers` | 좌클릭/우클릭/롱프레스 감지 및 타일 상호작용 처리 |
| `useMovement` | A* 경로탐색, 이동 경로 따라 커서 애니메이션, MOVE 이벤트 전송 |
| `useCursorRenderer` | 내 커서, 다른 유저 커서, 경로선을 Canvas 2D에 그리기 |
| `useExplosionManager` | 활성 폭발(위치, 시작시간, ID) 추적 |
| `useShockwaveAnimation` | RAF 루프로 폭발 애니메이션 (섬광, 광선, 링, 스파크) |
| `useSkillTree` | ReactFlow 노드/엣지 관리, 스킬 구매, 이동속도 계산 |
| `useTilemapTextures` | 숫자 텍스처 + SVG 에셋을 Pixi Texture로 프리렌더링 |
| `useScreenSize` | 윈도우 리사이즈 이벤트 감지, 뷰포트 크기 반환 |

### Stores

| 스토어 | 관리 상태 |
|--------|-----------|
| `websocketStore` | 소켓 객체, isOpen, 메시지 버퍼, binary 메시지, connect/disconnect/sendMessage |
| `tileStore` | tiles(TileGrid), renderTiles, startPoint/endPoint, tileSize, padtiles/applyChanges |
| `cursorStore` | 플레이어: id, position, color, zoom, score, items; 다른 유저 커서 목록 |
| `interactionStore` | 클릭 위치(x, y, content), movecost, useAnimation 토글 |
| `skillTreeStore` | purchasedSkills 배열 |
| `rankingStore` | 리더보드 rankings |

### 주요 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `canvas/` | 오케스트레이터: 타일맵, 커서 렌더링, 입력, 애니메이션 총괄 |
| `tilemap/` | Pixi Stage + 스프라이트 풀(bg, closed, boom, flag, number 레이어) |
| `canvasDashboard/` | 줌 버튼, 점수/폭탄 표시, 애니메이션/폭탄 모드 토글 |
| `skilltree/` | ReactFlow 그래프 + 스킬 정보 패널 + 구매 버튼 |

---

## 성능 최적화 기법

| 기법 | 설명 |
|------|------|
| 스프라이트 풀링 | 매 프레임 Pixi 스프라이트 생성/파괴 대신 재사용 |
| Flat Uint8Array | `Uint8Array.slice()`로 O(1) 네이티브 memcpy 타일 복사 |
| 벡터화 LUT | 16비트 hex→타일 타입 O(1) 변환 (분기 없음) |
| WASM 처리 | Hex 타일 디코딩을 JS 대비 10-100배 빠르게 처리 |
| RAF 루프 | 메인 스레드 블로킹 없이 60fps 부드러운 애니메이션 |
| 텍스처 캐싱 | 숫자 텍스처 + SVG 에셋을 시작 시 한 번만 렌더링 |
| 동시성 제한 | 텍스처 생성 시 최대 8개 동시 GPU 작업으로 스톨 방지 |
| LRU 타일 캐시 | 월드 좌표 기반 캐시로 재방문 시 즉시 복원 |
| SET_WINDOW 디바운스 | 200ms 디바운스로 서버 요청 감소 |
| A* 조기 종료 | 인접 타일은 전체 경로탐색 생략 |