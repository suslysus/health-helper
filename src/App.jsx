import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import BottomNav from "./components/BottomNav";
import HomeScreen from "./components/HomeScreen";
import WorkoutScreen from "./components/WorkoutScreen";
import MealScreen from "./components/MealScreen";
import RecoveryScreen from "./components/RecoveryScreen";
import ProfileScreen from "./components/ProfileScreen";
import Modal from "./components/Modal";
import { workoutExercises } from "./data";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedDay, setSelectedDay] = useState(21);
  const [workoutMode, setWorkoutMode] = useState("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [routineItems, setRoutineItems] = useState(() => workoutExercises.map((exercise) => exercise.name));
  const contentRef = useRef(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeTab, workoutMode, profileOpen]);

  const startWorkout = () => {
    setActiveTab("workout");
    setWorkoutMode("prepare");
  };

  const renderScreen = () => {
    if (profileOpen) return <ProfileScreen onBack={() => setProfileOpen(false)} />;
    if (activeTab === "home") return <HomeScreen selectedDay={selectedDay} setSelectedDay={setSelectedDay} onStartWorkout={startWorkout} onOpenRoutine={() => setRoutineOpen(true)} />;
    if (activeTab === "workout") return <WorkoutScreen mode={workoutMode} setMode={setWorkoutMode} onBackHome={() => setActiveTab("home")} />;
    if (activeTab === "meal") return <MealScreen />;
    return <RecoveryScreen />;
  };

  const sessionActive = activeTab === "workout" && workoutMode === "active";

  return (
    <main className="app-shell">
      <div className="phone-frame">
        {!profileOpen && !sessionActive && (
          <header className="app-header">
            <button className="brand" onClick={() => setActiveTab("home")} aria-label="홈으로 이동">
              <span className="brand-mark">H</span>
              <span>HealthLog</span>
            </button>
            <button className="profile-button" onClick={() => setProfileOpen(true)} aria-label="프로필 열기">
              <UserRound size={19} />
            </button>
          </header>
        )}

        <div ref={contentRef} className={sessionActive ? "app-content session-content" : "app-content"}>{renderScreen()}</div>
        <BottomNav active={activeTab} onChange={(tab) => { setProfileOpen(false); setActiveTab(tab); }} hidden={profileOpen || sessionActive} />

        {routineOpen && (
          <Modal title="오늘 구성 수정" onClose={() => setRoutineOpen(false)}>
            <p className="sheet-description">오늘 운동에만 적용됩니다. 운동을 길게 눌러 순서를 바꿀 수 있습니다.</p>
            <div className="routine-edit-list">
              {workoutExercises.map((exercise, index) => (
                <div key={exercise.name} className={routineItems.includes(exercise.name) ? "" : "disabled-row"}>
                  <span>{index + 1}</span>
                  <strong>{exercise.name}</strong>
                  <button
                    onClick={() => setRoutineItems((items) => items.includes(exercise.name) ? items.filter((item) => item !== exercise.name) : [...items, exercise.name])}
                    aria-label={`${exercise.name} ${routineItems.includes(exercise.name) ? "제외" : "포함"}`}
                  >{routineItems.includes(exercise.name) ? "×" : "+"}</button>
                </div>
              ))}
            </div>
            <button className="primary-button" onClick={() => setRoutineOpen(false)}>구성 저장</button>
          </Modal>
        )}
      </div>
    </main>
  );
}
