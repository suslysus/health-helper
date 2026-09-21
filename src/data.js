export const calendarDays = Array.from({ length: 30 }, (_, index) => index + 1);

export const dayRecords = {
  1: { workout: "PUSH 완료", meal: "2,430 / 2,600kcal", sleep: "7시간 12분", weight: "70.0kg", status: "complete" },
  3: { workout: "PULL 완료", meal: "2,280 / 2,600kcal", sleep: "6시간 55분", weight: "70.1kg", status: "complete" },
  5: { workout: "LEGS 완료", meal: "2,510 / 2,600kcal", sleep: "7시간 31분", weight: "70.2kg", status: "complete" },
  8: { workout: "PUSH 완료", meal: "2,390 / 2,600kcal", sleep: "7시간 04분", weight: "70.2kg", status: "complete" },
  10: { workout: "PULL 완료", meal: "2,470 / 2,600kcal", sleep: "6시간 42분", weight: "70.1kg", status: "complete" },
  12: { workout: "LEGS 완료", meal: "2,320 / 2,600kcal", sleep: "7시간 20분", weight: "70.4kg", status: "complete" },
  15: { workout: "PUSH 완료", meal: "2,410 / 2,600kcal", sleep: "7시간 01분", weight: "70.2kg", status: "complete" },
  17: { workout: "PULL 완료", meal: "2,350 / 2,600kcal", sleep: "6시간 48분", weight: "70.3kg", status: "complete" },
  19: { workout: "LEGS 완료", meal: "1,980 / 2,600kcal", sleep: "6시간 20분", weight: "미기록", status: "partial" },
  21: { workout: "PUSH 예정", meal: "1,820 / 2,600kcal", sleep: "6시간 48분", weight: "미기록", status: "partial" },
};

export const workoutExercises = [
  { name: "Bench Press", target: "가슴", sets: 3, reps: "8~10", weight: 60, done: true },
  { name: "Hammer Press", target: "가슴", sets: 3, reps: "8~10", weight: 45, done: false },
  { name: "Lateral Raise", target: "어깨", sets: 3, reps: "12~15", weight: 12, done: false },
  { name: "Rear Delt Fly", target: "후면 어깨", sets: 3, reps: "12~15", weight: 10, done: false },
  { name: "Cable Pushdown", target: "삼두", sets: 3, reps: "12~15", weight: 20, done: false },
  { name: "Overhead Extension", target: "삼두", sets: 3, reps: "10~12", weight: 15, done: false },
];

export const meals = [
  {
    time: "08:10",
    title: "아침",
    calories: 510,
    items: [
      { name: "오트밀", amount: "70g", calories: 280, macro: "탄 47 · 단 10 · 지 5" },
      { name: "삶은 달걀", amount: "2개", calories: 140, macro: "탄 1 · 단 12 · 지 9" },
      { name: "바나나", amount: "1개", calories: 90, macro: "탄 23 · 단 1 · 지 0" },
    ],
  },
  {
    time: "12:30",
    title: "점심",
    calories: 500,
    items: [
      { name: "닭가슴살 샐러드", amount: "350g", calories: 420, macro: "탄 15 · 단 45 · 지 12" },
      { name: "두유", amount: "190ml", calories: 80, macro: "탄 7 · 단 7 · 지 3" },
    ],
  },
  {
    time: "16:10",
    title: "간식",
    calories: 190,
    items: [{ name: "단백질 바", amount: "1개", calories: 190, macro: "탄 22 · 단 17 · 지 5" }],
  },
];
