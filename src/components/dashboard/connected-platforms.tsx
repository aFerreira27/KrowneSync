import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Platform } from "@/app/dashboard/layout";

export function ConnectedPlatforms({ platforms }: { platforms: Platform[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-xl">Connected Platforms</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {platforms.map((platform) => (
            <li key={platform.name} className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {platform.icon}
                <span className="font-medium">{platform.name}</span>
              </div>
              <Badge 
                variant={platform.connected ? 'secondary' : 'outline'} 
                className={platform.connected 
                  ? 'bg-green-100/50 text-green-800 dark:text-green-200 border-green-200/50' 
                  : ''}
              >
                {platform.connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}