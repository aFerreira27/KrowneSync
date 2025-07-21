import { cn } from "@/lib/utils";
import Image from "next/image";

const Logo = ({ className, textClassName, showText = true }: { className?: string, textClassName?: string, showText?: boolean }) => (
  <div className={cn("flex items-center justify-center", className)}>
    <Image src="/images/krowneSync.svg" alt="KrowneSync Logo" width={164} height={40} className="h-full w-auto" />
    {showText && <span className={cn("font-headline text-2xl font-bold ml-3 text-primary", textClassName)}>
      KrowneSync
    </span>}
  </div>
);

export default Logo;
