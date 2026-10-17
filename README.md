# HealthLog

React/Vite 웹 UI와 Capacitor Android로 만든 개인용 운동·러닝·식사 기록 앱입니다. 추천은 실제 기록을 사용하는 로컬 규칙으로 동작하고, Gemini는 요청한 문장 해석과 음식 추정에 사용합니다.

## 실행

Node.js 22 이상이 필요합니다.

```powershell
npm install
npm run dev
```

개발 주소는 `http://localhost:5173`입니다. Gemini 키는 앱의 **프로필 → AI 연결**에서 입력합니다. 서버나 환경 변수는 필요하지 않습니다.

## 운동 데이터와 추천

- 전체 기구를 한 목록에서 검색·선택합니다. 기구 ID와 운동 ID는 공통 카탈로그로 연결합니다.
- 운동 정의에는 동작·주사용근·보조근·태그·측정 단위를 저장합니다. 사용자 선호와 우선순위는 계획에, 실제 세트는 운동 기록에 보관합니다.
- 날짜 기준 과거 기록·PPL 순환·최근 실제 세트량·입력한 피로와 오늘 가능한 시간을 반영합니다.
- 같은 운동 변형·장소·기구·중량 기준의 정상 세트를 사용합니다. 종목 교체 전 기록도 조회하며 오래된 기록은 자동 증량을 보류합니다.
- 시작 전 초안은 과거 기록 변경에 맞춰 갱신합니다. 시작한 운동과 완료 기록은 유지합니다.
- 몸풀기·워밍업·휴식 시간을 포함해 세트를 배분합니다. 명시한 우선 운동조차 시간이 부족하면 초과 상태를 표시합니다. 예상 시간은 실제 종료를 보장하지 않습니다.
- 기록이 없는 중량 운동은 임의로 0kg를 추천하지 않고 실제 중량 입력을 안내합니다.
- 워밍업 중량은 본세트 기록을 기준으로 추천하며 기록이 없으면 빈칸입니다. 별도 중량·횟수 입력 없이 준비운동 완료 여부만 저장합니다. 이전 워밍업 기록은 보존합니다.

## 식사와 Gemini

식사명과 사진에서 영양값을 추정하고 저장 전에 확인합니다. 직접 입력한 값은 보존합니다. Gemini의 동일 진행 요청은 합치고, 잠깐의 요청 제한만 최대 한 번 재시도합니다. 일일 한도·권한·시간 초과·잘못된 응답은 구분해 안내합니다. 프로젝트 할당량이 소진되면 앱의 재시도로 해결되지 않으므로 Google AI Studio 사용량을 확인해야 합니다.

## Android

Android Studio와 Android SDK 설치 후 `android/` 폴더를 엽니다.

```powershell
npm run android:sync
npm run android:open
cd android
.\gradlew.bat assembleDebug
```

`android:sync`는 웹 빌드를 수행한 뒤 Android assets에 복사합니다. `android/local.properties`의 `sdk.dir`는 현재 PC의 실제 SDK 위치여야 합니다. API 키는 Android Keystore로 암호화해 저장합니다. 기존 앱의 운동·식사·체중 기록은 기기 로컬 데이터이므로 소스코드 복사와 별개입니다. 다른 기기와 자동 동기화하는 서버는 없습니다.

기존 폰 앱을 기록 유지 상태로 업데이트하려면 같은 서명키를 사용해야 합니다. 이전 PC의 디버그 키를 `verification/signing/debug.keystore`에 두면 Android 빌드가 해당 키를 사용합니다. 이 폴더는 Git에서 제외됩니다. 현재 프로젝트는 Java 21로 빌드했습니다.

러닝은 GPS 또는 러닝머신 시간·랩을 기록합니다. Android 위치 서비스·알림과 실제 야외 거리의 정확성은 실기기에서 검증해야 합니다.

## 검사와 구조 문서

```powershell
npm test
npm run check:deps
npm run build
```

- [구조·데이터 흐름·수정 내역과 검증 한계](docs/ARCHITECTURE.md)
- [전체 소스의 직접 의존관계](docs/DEPENDENCIES.md)

의존관계 표 재생성: `node scripts/check-dependencies.mjs --write-doc`

주요 소스는 `src/`, 네이티브 코드는 `android/app/src/main/java/com/healthlog/app/`, 회귀 테스트는 `test/`에 있습니다. `dist`, `node_modules`, Android `build`와 `.gradle`은 재생성 가능한 파일입니다. `verification/`은 검증 이미지 보관용이고 원본 `healthapp.zip`은 이전 프로젝트 백업으로 유지합니다.
