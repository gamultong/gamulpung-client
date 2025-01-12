# 가물펑 규칙

## 행동 요약:
| 타일 상태 | 일반 클릭 (왼쪽 클릭)                     | 특수 클릭 (오른쪽 클릭)              |
|------------|-------------------------------------------|--------------------------------------|
| 닫힘       | 타일 열기 (지뢰 또는 숫자 표시)           | 타일에 깃발 설정 (깃발 상태로 변경)  |
| 열림       | 경로가 있으면 타일로 이동                 | 아무 행동도 하지 않음                |
| 폭발       | 경로가 있으면 타일로 이동                 | 아무 행동도 하지 않음                |
| 깃발       | 아무 행동도 하지 않음                     | 깃발 제거 (닫힘 상태로 변경)         |

## 타일 상태
지뢰찾기에서 타일의 네 가지 가능한 상태는 다음과 같습니다:
1. "닫힘" (타일에 아무 행동도 하지 않음)
2. "열림" (지뢰가 없는 타일을 활성화)
3. "폭발" (지뢰가 있는 타일을 활성화)
4. "깃발" (타일에 깃발 설정)

## 인접 타일 활성화
"일반 클릭" (데스크탑에서 왼쪽 클릭) 또는 "특수 클릭" (데스크탑에서 오른쪽 클릭)을 사용하여 타일을 활성화할 수 있습니다.

### 일반 클릭 (왼쪽 클릭):
- "열림" 또는 "폭발": 경로가 있으면 클릭된 타일로 이동할 수 있습니다 (초당 5 타일).
- "닫힘": 타일을 "열어" 지뢰가 있는지 확인할 수 있습니다. 지뢰가 있으면 타일이 폭발하여 제어를 잃게 됩니다. 지뢰가 없으면 인접한 지뢰의 수를 알 수 있습니다.

그러나 인접한 타일 중 하나라도 폭발하면 모든 타일의 제어를 3분 동안 잃게 됩니다.

### 특수 클릭 (오른쪽 클릭):
- "닫힘": 클릭된 타일에 자신의 깃발을 설정하여 상태를 "깃발"로 만들 수 있습니다.
- "깃발": 클릭된 타일에서 깃발을 제거하여 상태를 "닫힘"으로 만들 수 있습니다.
- "열림" 또는 "폭발": 경로가 있으면 클릭된 타일로 이동할 수 있습니다 (초당 5 타일).
- "닫힘": 타일을 "열어" 지뢰가 있는지 확인할 수 있습니다. 지뢰가 있으면 타일이 폭발하여 제어를 잃게 됩니다. 지뢰가 없으면 인접한 지뢰의 수를 알 수 있습니다.

그러나 인접한 타일 중 하나라도 폭발하면 모든 타일의 제어를 3분 동안 잃게 됩니다.

### 특수 클릭 (오른쪽 클릭):
- "닫힘": 클릭된 타일에 자신의 깃발을 설정하여 상태를 "깃발"로 만들 수 있습니다.
- "깃발": 클릭된 타일에서 깃발을 제거하여 상태를 "닫힘"으로 만들 수 있습니다.
