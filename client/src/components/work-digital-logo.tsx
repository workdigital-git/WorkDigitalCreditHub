import { useTheme } from "@/lib/theme";
import darkLogo from "@assets/Work_Digital_Large_Logo_-_Gray_Background_with_White_Letters_1765734468272.png";
import lightLogo from "@assets/Work_Digital_Logo_1765734468273.png";
import gearLogo from "@assets/Work_Digital_Gear_Logo_Clean_1765734468272.jpg";

interface WorkDigitalLogoProps {
  variant?: "full" | "gear";
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function WorkDigitalLogo({ variant = "full", className = "", size = "md" }: WorkDigitalLogoProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const sizeClasses = {
    sm: variant === "gear" ? "h-6 w-6" : "h-6",
    md: variant === "gear" ? "h-8 w-8" : "h-8",
    lg: variant === "gear" ? "h-12 w-12" : "h-10",
  };

  if (variant === "gear") {
    return (
      <img
        src={gearLogo}
        alt="Work Digital"
        className={`${sizeClasses[size]} rounded-md object-contain ${className}`}
      />
    );
  }

  return (
    <img
      src={isDark ? darkLogo : lightLogo}
      alt="Work Digital"
      className={`${sizeClasses[size]} object-contain ${className}`}
    />
  );
}

export function WorkDigitalBranding({ showTagline = true }: { showTagline?: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-3">
      <img
        src={isDark ? darkLogo : lightLogo}
        alt="Work Digital"
        className="h-8 object-contain"
      />
      {showTagline && (
        <div className="hidden sm:block border-l border-border pl-3">
          <span className="text-xs text-muted-foreground font-medium">
            Credit Portal
          </span>
        </div>
      )}
    </div>
  );
}
