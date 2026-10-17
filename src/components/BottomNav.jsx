import { Dumbbell, Footprints, Home, Utensils } from "lucide-react";

const items = [
  { id: "home", label: "홈", icon: Home },
  { id: "workout", label: "운동", icon: Dumbbell },
  { id: "running", label: "러닝", icon: Footprints },
  { id: "meal", label: "체중·식사", icon: Utensils },
];

export default function BottomNav({ active, onChange, hidden = false }) {
  if (hidden) return null;

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={active === id ? "nav-item active" : "nav-item"}
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
        >
          <Icon size={20} strokeWidth={active === id ? 2.5 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
