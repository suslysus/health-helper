# 소스 의존관계

`node scripts/check-dependencies.mjs --write-doc`로 재생성합니다.

진입점: `src/main.jsx`. 순환 참조·누락된 import·진입점에서 도달할 수 없는 JS/JSX/CSS 파일을 검사합니다.

| 파일 | 직접 참조하는 로컬 파일 |
|---|---|
| src/App.jsx | src/components/BottomNav.jsx<br>src/components/HomeScreen.jsx<br>src/components/MealScreen.jsx<br>src/components/Modal.jsx<br>src/components/OnboardingScreen.jsx<br>src/components/ProfileScreen.jsx<br>src/components/RunningScreen.jsx<br>src/components/WorkoutScreen.jsx<br>src/lib/ai.js<br>src/lib/dates.js<br>src/lib/nativeRunning.js<br>src/lib/program.js<br>src/lib/running.js<br>src/lib/schedule.js<br>src/lib/storage.js<br>src/lib/trainingRules.js<br>src/lib/workoutHistory.js<br>src/lib/workoutLocation.js<br>src/lib/workoutState.js |
| src/components/BottomNav.jsx | 외부 라이브러리 또는 독립 모듈 |
| src/components/HomeScreen.jsx | src/components/Modal.jsx<br>src/lib/program.js<br>src/lib/workoutHistory.js |
| src/components/LocationManager.jsx | src/lib/program.js |
| src/components/MealScreen.jsx | src/components/Modal.jsx<br>src/components/WeightSummary.jsx<br>src/lib/body.js<br>src/lib/mealEstimate.js<br>src/lib/mealPhoto.js<br>src/lib/nutrition.js |
| src/components/Modal.jsx | 외부 라이브러리 또는 독립 모듈 |
| src/components/OnboardingScreen.jsx | src/components/PlanProposal.jsx<br>src/lib/program.js |
| src/components/PlanProposal.jsx | src/components/TrainingRuleSummary.jsx<br>src/lib/program.js |
| src/components/ProfileScreen.jsx | src/components/LocationManager.jsx<br>src/components/ProgramScreen.jsx<br>src/components/TrainingRuleSummary.jsx<br>src/components/WeightSummary.jsx<br>src/lib/body.js<br>src/lib/program.js<br>src/lib/trainingRules.js |
| src/components/ProgramScreen.jsx | src/components/PlanProposal.jsx<br>src/lib/program.js |
| src/components/RunningScreen.jsx | 외부 라이브러리 또는 독립 모듈 |
| src/components/TrainingRuleSummary.jsx | src/lib/program.js<br>src/lib/trainingRules.js |
| src/components/WeightSummary.jsx | 외부 라이브러리 또는 독립 모듈 |
| src/components/WorkoutScreen.jsx | src/components/Modal.jsx<br>src/lib/nativeTimers.js<br>src/lib/program.js<br>src/lib/restPreview.js<br>src/lib/trainingRules.js<br>src/lib/workoutHistory.js |
| src/lib/ai.js | src/lib/exerciseCatalog.js<br>src/lib/geminiClient.js<br>src/lib/trainingRules.js |
| src/lib/body.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/dates.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/exerciseCatalog.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/geminiClient.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/mealEstimate.js | src/lib/nutrition.js |
| src/lib/mealPhoto.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/nativeRunning.js | src/lib/running.js |
| src/lib/nativeTimers.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/nutrition.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/program.js | src/lib/dates.js<br>src/lib/exerciseCatalog.js<br>src/lib/nutrition.js<br>src/lib/trainingRules.js<br>src/lib/workoutHistory.js |
| src/lib/restPreview.js | src/lib/program.js |
| src/lib/running.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/schedule.js | src/lib/dates.js<br>src/lib/program.js<br>src/lib/workoutHistory.js |
| src/lib/storage.js | src/lib/body.js<br>src/lib/program.js<br>src/lib/workoutHistory.js |
| src/lib/trainingRules.js | 외부 라이브러리 또는 독립 모듈 |
| src/lib/workoutHistory.js | src/lib/exerciseCatalog.js |
| src/lib/workoutLocation.js | src/lib/program.js |
| src/lib/workoutState.js | src/lib/program.js<br>src/lib/workoutHistory.js<br>src/lib/workoutLocation.js |
| src/main.jsx | src/App.jsx<br>src/styles.css |
| src/styles.css | 외부 라이브러리 또는 독립 모듈 |

외부 패키지: @capacitor/core, lucide-react, react, react-dom/client

Android Java 및 정적 이미지 연결은 ARCHITECTURE.md를 참고하세요.
