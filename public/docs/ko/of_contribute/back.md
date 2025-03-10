# 프로젝트 백엔드 구조

## 각 모듈의 구조

```bash
[모듈: "A"]
 ├── [하위 모듈]       → A 모듈에 종속된 모듈, A와 동일한 구조
 ├── internal         → 핵심 코드 저장소
 ├── test             → internal의 테스트 코드 저장소
 │   ├── __init__.py  → 모든 테스트를 모아 export, [코드베이스 루트]/test에서 import 가능
 ├── __init__.py      → internal의 코드 export

```

internal과 __init__.py의 존재 이유는 파이썬에서 자체적으로 제공하지 않는 선택적 export를 구현하기 위함. `from A import XXX`와 같은 직관적인 import문을 사용함과 동시에 의도한 오브젝트만 export할 수 있음. 사소한 단점은 depth가 배로 깊어진다는 것.

## 컴포넌트 정리

1. Data: `/data`
    프로젝트에서 사용되는 실질적인 데이터를 모두 포함.
    Cursor, Tile과 같은 도메인 데이터부터 Event에 사용되는 Payload 등의 내부 DTO도 해당됨. 

2. Handler: `/handler`
    데이터 자체, 혹은 데이터 간 관계도 관리하는 컴포넌트. 
    데이터에 상호작용하기 위해 접근해야하는 인터페이스로 볼 수 있음. 각 Handler는 한 가지 데이터에 종속적임.
    
3. Receiver: `/receiver`
    실제 비즈니스 로직을 담당하는 컴포넌트.
    이벤트와 n:m으로 연결될 수 있음.
    현재는 각각 1개의 이벤트를 구독하며, 그에 따른 로직을 실행함. 각 데이터의 Handler를 사용할 수 있음.
    로직에 따른 Output은 Handler를 사용한 데이터 상태 변경이나 Event를 발행하는 것으로 생성됨.

4. Event: `/event`
    Event 발행에 필요한 Message의 선언, 그리고 EventBroker가 위치함.

## 컴포넌트 구조 시각화

![](https://cdn.discordapp.com/attachments/1300053843366776862/1347754020986683554/image.png?ex=67cf9c3e&is=67ce4abe&hm=7e8b4741d6c747fa974961d25a6f90989ccb2228a6476f060163078837052e44&)
    