# 구조·데이터 흐름 점검과 정리

2026-10-17 소스 기준입니다. 휴대폰의 실제 저장 데이터와 Google 프로젝트의 사용량을 열람한 결과는 아닙니다.

## 데이터 모델

운동의 정의, 사용자의 선택 기준, 실제 수행 기록을 분리합니다. 이전 운동 기록을 카탈로그 안에 넣으면 사용자·장소·기구 변형별 기록이 서로 섞이고 여러 복사본을 갱신해야 합니다.

```text
exerciseCatalog
  exerciseId → 운동 이름, 동작, 주사용근, 보조근, 태그, 기구 ID, 측정 단위
  equipmentId → 기구 이름, 별칭, 가능한 exerciseIds (운동 정의에서 역산)

plan / trainingRules
  우선 동작, 선호·제외·항상 포함할 운동 ID, 운동 순환, 기구 선호

locations
  locationId → 실제 기구, 기구 instanceId, 중량 기록 기준, 가능한 중량·간격

drafts[date]
  현재 루틴, 시간 배분, 계획 버전, historyKey, 진행 상태, 실제 세트

history[]
  date, status, context, exercises[]
    exerciseId, loadBasis, equipmentKey, primaryMuscles, secondaryMuscles
    warmupCompleted (준비운동 완료 여부)
    completedSets[]
      실제 중량·반복·시간, 상태, at, exerciseId, phase
      recommendationSnapshot (당시 추천값과 출처)
    replacedExercise (교체 전 실제 기록을 보존)
```

워밍업은 별도 중량·반복 기록을 만들지 않습니다. 같은 종목·장소·기구·중량 기준의 본세트로 준비 중량을 추천하며, 본세트 기록이 없으면 추천 중량은 빈칸입니다. `warmupCompleted`만 저장해 진행률·남은 시간·휴식 뒤 본세트 진입에 사용합니다. 이전 `completedWarmups[]`는 원문 그대로 보존하며 추천 근거로 사용하지 않습니다.

운동 ID는 그립 변형별로 구분합니다. 운동 우선순위는 모든 사용자에게 고정된 운동 속성이 아니라 `plan.priorities`와 루틴 항목의 `priority`입니다. 기록 조회는 ID·날짜·장소·기구·중량 기준을 함께 비교합니다. `exerciseRecords()`가 저장된 세션에서 필요한 기록을 계산하므로 별도의 최신 기록 복사본을 저장하지 않습니다.

이전 중첩 저장 형식은 유지하고 `recordSchemaVersion: 2`와 ID·태그를 보완합니다. 실제 세트, 날짜, 추천 스냅샷은 보존합니다. 프로필 규칙은 버전 3으로 읽으며 버전 1·2의 원문 연결과 전완 설정을 공통 우선순위로 이전합니다. 루틴 규칙 버전은 4입니다.

## 주요 의존관계

```text
main.jsx → App.jsx
             ├─ HomeScreen
             ├─ WorkoutScreen → program, restPreview, nativeTimers
             ├─ ProfileScreen → TrainingRuleSummary, ProgramScreen, LocationManager
             ├─ MealScreen → nutrition, body, mealEstimate, mealPhoto
             ├─ RunningScreen → nativeRunning → running
             ├─ workoutState → program, workoutHistory, workoutLocation
             ├─ storage → program, workoutHistory, body
             └─ ai → geminiClient, exerciseCatalog, trainingRules

program → exerciseCatalog, workoutHistory, trainingRules, dates
workoutHistory → exerciseCatalog
schedule → program, workoutHistory, dates
```

각 파일의 직접 참조 목록은 [DEPENDENCIES.md](DEPENDENCIES.md)에 있습니다. `npm run check:deps`는 누락된 import, 순환 참조, 실행 진입점에서 도달하지 않는 JS/JSX/CSS 파일을 검사합니다. `program.js`의 기존 카탈로그·영양 export는 이전 호출부와 테스트를 위한 호환 진입점이며 실제 정의는 각각 별도 모듈에 있습니다.

## 확인한 문제와 수정

| 문제 | 확인한 원인 | 변경 |
|---|---|---|
| 미래 기록이 현재 추천에 섞임 | 운동 종류 판단과 종목 순환에서 서로 다른 날짜 필터 사용 | `historyThroughDate`로 필터·정렬 통일, 초안 제외 |
| 완료·삭제 뒤 추천이 갱신되지 않음 | 저장된 시작 전 초안을 계획 버전만 보고 재사용 | 과거 기록의 `historyKey`가 달라지면 시작 전 초안 재생성 |
| 교체 전 운동 기록 누락 | 추천에서 최상위 `exercises`만 조회 | `recordedExercises`로 교체 이력까지 순회 |
| 최근 세트가 모두 통증이면 기록이 없는 것처럼 추천 | 첫 종목을 찾은 다음 정상 세트를 조회해 더 과거 기록 검색 중단 | 정상 세트가 있는 최근 기록을 먼저 찾음 |
| 운동 태그·근육 정보 불일치 | 카탈로그·생성·수동 추가·교체에서 각각 객체 구성 | 공통 카탈로그와 `createPlannedExercise` 사용 |
| 기구→운동 정보가 두 곳에 중복됨 | 운동의 기구 ID와 기구의 운동 목록을 각각 관리 | 기구별 운동 목록을 운동 정의에서 계산 |
| 가능한 운동 목록에 실제 불가능한 운동 표시 | 기구 목록의 합집합만 표시, 필수 보조 기구 미확인 | 실제 추천과 동일한 `availableExercises` 사용 |
| 특정 부위만 별도 설정 | 하체 머신 4개 전용 버튼과 전완 전용 설정 | 전체 기구 검색·선택과 공통 동작 우선순위로 통합 |
| 짧은 루틴이 시간 초과 | 휴식을 과소 추정하고 선택 세트를 한 번만 축소 | 실제 기본 휴식(워밍업 60초·본세트 120초) 포함, 반복 축소·선택 운동 제외 |
| 짧은 운동에서 우선순위 순서가 덮어써짐 | 시간별 패턴 필터가 앞서 정렬한 순서를 재구성 | 필터링 후 명시 순서·우선순위 재적용 |
| 오래된 기록으로 자동 증량 | 날짜 경과와 관계없이 이전 상한 반복 적용 | 14일 이상 지난 기록의 자동 증량 보류와 이유 표시 |
| 일시정지한 초안이 미뤄지거나 내일 기록이 덮어써짐 | 시작 판정이 화면마다 다르고 대상 날짜 검사 누락 | 공통 시작 판정과 미루기 대상 기록 검사 |
| 저장 실패를 알 수 없음 | 일반 기록의 저장 실패를 무시 | 화면에 저장 실패 경고 표시 |
| 최초 수행에서 0kg를 추천처럼 표시 | 기준 기록이 없는 중량 운동의 기본값 사용 | 직접 중량 입력 안내, 임의 0kg 추천 방지 |
| Gemini “Too many requests” | 기존 코드는 429를 포괄 안내하고 요청 제어가 없음 | 다음 절의 요청 제어 적용 |

14일 보류, 최근 7일 볼륨, 피로 점수 기준은 앱의 보수적인 규칙입니다. 개인별 회복 속도를 측정하거나 의학적으로 회복 여부를 판단하는 기능은 아닙니다. 우선 운동의 최소 세트조차 시간 안에 들어가지 않으면 운동을 조용히 삭제하지 않고 `timeOverrun`과 안내를 표시합니다. 시간 추정은 수행·휴식·이동에 대한 가정이므로 실제 종료 시간을 보장하지 않습니다.

## Gemini 요청 흐름

`MealScreen → App → ai.estimateMeal / analyzeMealPhoto → geminiClient → Gemini`

- 동일한 진행 중 요청은 합치고 서로 다른 요청은 직렬화합니다. 기본 요청 간격은 1초입니다.
- 영양 추정의 같은 입력·키·모델 결과는 메모리에서 10분, 최대 20개 재사용합니다. 사진과 운동 계획은 결과 캐시를 쓰지 않습니다.
- 요청과 본문 읽기에 30초 제한을 둡니다. 네이티브 fetch가 취소 신호를 무시해도 UI 대기는 종료합니다. 이 경우 원격 요청 자체의 취소를 보장하지는 않습니다.
- 429 또는 일시적 서버 오류는 최대 한 번만 재시도합니다. 서버가 지정한 대기가 3초를 넘으면 자동 재시도하지 않습니다.
- 일일·지출 한도 또는 할당량 0은 재시도하지 않습니다. 429 후에는 서버 대기 시간 또는 기본 60초 동안 추가 요청을 막습니다.
- 응답 차단, 빈 응답, 길이 초과, 잘못된 JSON, 스키마 누락, 잘못된 키, 권한, 요청 형식, 네트워크 오류를 구분합니다. 서버의 원문 오류나 키를 화면에 그대로 출력하지 않습니다.
- 영양 추정은 저장 전 검토가 필요하며 직접 입력한 영양값을 덮어쓰지 않습니다.

사용자가 기억한 영어 문구는 429일 가능성이 높지만 실제 오류 응답을 보지 못했으므로 특정 한도 원인은 확정하지 않았습니다. Google의 제한은 프로젝트·모델·이용 등급에 따라 달라지므로 1초 간격만으로 429가 없어지는 것은 아닙니다. 같은 프로젝트에서 키만 다시 발급해도 한도는 공유됩니다.

공식 참고: [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting). 이 작업에서는 실제 Gemini 키를 사용하거나 유료 호출을 하지 않았습니다.

## Android와 저장 연결

- `MainActivity`가 `SecureStorePlugin`, `RestTimerPlugin`, `RunningTrackerPlugin`을 등록합니다.
- `ai.js → SecureStorePlugin`: Android Keystore로 키 암호화. 웹 개발은 별도의 로컬 저장소 키를 사용합니다.
- `nativeTimers.js → RestTimerPlugin`: 휴식·시간 운동 알림.
- `nativeRunning.js → RunningTrackerPlugin → RunningTrackerService`: 러닝 상태·위치·랩. `RunningSession`, `RunningGpsFilter`, `RunningLapTiming`은 서비스의 계산·저장 보조 코드입니다.
- Manifest는 인터넷·알림·위치·위치 서비스 권한과 `RunningTrackerService`를 선언합니다. 이번 정리에서는 권한을 확장하지 않았습니다.
- `public/healthlog-logo-v1.png`는 상단·온보딩·브라우저 아이콘에 사용합니다. Android `drawable-nodpi/healthlog_logo.png`, 런처·시작 화면 XML과 리소스는 네이티브 패키징용이므로 유지합니다.
- `npm run android:sync`는 `dist`를 `android/app/src/main/assets/public`로 복사합니다. Java와 웹 UI는 이 경계로 연결됩니다.

운동·식사·체중은 `health-helper-v1` 로컬 저장소에 있습니다. 러닝은 Android 전용 저장 상태도 사용합니다. 계정·백엔드·클라우드 동기화는 없습니다. 이전 폰 데이터는 소스코드와 별개입니다. 이 작업은 폰의 기록을 읽거나 삭제하지 않았습니다.

## 삭제·정리 범위

- 미사용 `server/index.mjs`: 현재 앱과 연결되지 않은 이전 API 서버.
- 미사용 `src/data.js`, `RecoveryScreen.jsx`: 샘플 기록과 저장되지 않는 샘플 회복 화면.
- 미연결 `jev.js` 및 관련 테스트·키 설정 UI: 실행 화면에서 호출하지 않던 공급자. 기존 보안 저장소의 키는 삭제하지 않았습니다.
- Android 샘플 `2+2` 테스트 삭제. 잘못된 앱 ID를 검사하던 샘플 계측 테스트는 실제 `com.healthlog.app` 검사로 대체했습니다. 실제 GPS 회귀 테스트는 유지합니다.
- 이전 PC의 Android/Capacitor 빌드 산출물과 IDE 캐시 정리. 프로젝트 원본·Gradle wrapper·러닝 네이티브 코드는 유지합니다.
- 이미지 생성 프롬프트는 `public`에서 `docs/assets`로, 루트의 검증 이미지는 `verification/legacy`로 옮깁니다.
- 원본 `healthapp.zip`과 `.env.local`은 유지합니다. ZIP은 Git 추적 제외 목록에 추가합니다.
- 자주 쓰지 않는 화면은 지연 로딩하여 초기 JavaScript 파일을 분리합니다. 실제 전체 다운로드 크기는 사용 화면에 따라 달라집니다.

## 검증과 한계

`npm test`, `npm run check:deps`, `npm run build`, `npx cap sync android`로 검증합니다. 테스트는 데이터 이전·교체 기록·날짜 경계·중량 추천·시간 예산·AI 오류와 요청 제어를 포함합니다.

브라우저에서는 별도 로컬 테스트 주소에 가상 프로필·장소를 만들고 우선순위 저장, 30분 루틴, 세트 기록과 재실행을 확인합니다. 실제 폰의 기존 기록이나 Gemini 한도 오류를 재현한 검증과는 다릅니다.

이 컴퓨터에서는 이전 `android/local.properties`에 적힌 Android SDK 경로가 존재하지 않아 APK 빌드·계측 테스트·실기기 검증을 완료할 수 없습니다. Android Studio의 SDK 설치 후 확인해야 합니다.

### 이번 작업의 검증 결과

- Node 회귀 테스트 146개 통과.
- 소스 35개의 import 누락·순환 참조·미연결 파일 검사 통과.
- 프로덕션 빌드 통과. 초기 JS 517.48KB → 385.73KB (약 25% 감소, 나머지 화면은 별도 파일).
- 가상 프로필에서 공통 우선순위 저장, 기구 선택, 30분 루틴 생성, 12kg 세트 저장 → 다음 12kg 추천, 새로고침 후 기록 복원 확인. 브라우저 오류 로그 없음.
- Android 웹 assets 동기화와 원본 웹 빌드와의 내용 일치 확인. SDK 부재로 APK·실기기 테스트는 미실행.

[기록에서 추천으로 연결된 검증 화면](../verification/record-recommendation.png)
