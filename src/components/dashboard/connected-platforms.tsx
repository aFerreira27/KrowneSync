import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Platform } from "@/app/dashboard/layout";
import { Link } from "lucide-react";

export function ConnectedPlatforms({ platforms, onConnectClick }: { platforms: Platform[]; onConnectClick: () => void; }) {
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
              {platform.connected ? (
                <Badge 
                  variant='secondary'
                  className='bg-green-100/50 text-green-800 dark:text-green-200 border-green-200/50'
                >
                  Connected
                </Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={onConnectClick}>
                  <Link className="mr-2 h-3 w-3" />
                  Connect
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
