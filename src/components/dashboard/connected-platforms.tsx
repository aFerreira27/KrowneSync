import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Globe, ShoppingCart, Presentation } from "lucide-react";

const platforms = [
  { name: "Salesforce", icon: <Database className="h-6 w-6 text-blue-500" /> },
  { name: "Salespad", icon: <ShoppingCart className="h-6 w-6 text-red-500" /> },
  { name: "Autoquotes", icon: <Presentation className="h-6 w-6 text-yellow-500" /> },
  { name: "Website CMS", icon: <Globe className="h-6 w-6 text-green-500" /> },
];

export function ConnectedPlatforms() {
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
              <Badge variant="secondary" className="bg-green-100/50 text-green-800 dark:text-green-200 border-green-200/50">Connected</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
