import { cn } from "@/lib/utils";

const Logo = ({ className, textClassName, showText = true }: { className?: string, textClassName?: string, showText?: boolean }) => (
  <div className={cn("flex items-center justify-center", className)}>
    <svg
      viewBox="0 0 164 40"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-auto"
    >
      <rect width="164" height="40" rx="20" fill="#4CAF50" />
      <text
        x="82"
        y="27"
        fontFamily="'Space Grotesk', sans-serif"
        fontSize="24"
        fontWeight="bold"
        fill="white"
        textAnchor="middle"
      >
        SYNC
      </text>
    </svg>
    {showText && <span className={cn("font-headline text-2xl font-bold ml-3 text-primary", textClassName)}>
      Synchromatic
    </span>}
  </div>
);

export default Logo;
