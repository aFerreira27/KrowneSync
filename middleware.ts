// NOTE: This middleware is currently not compatible with onAuthStateChanged
// and client-side auth checks in layouts. It's best to handle redirection
// within the client components (e.g., DashboardLayout) for a smoother UX.
// We are keeping the file but its logic is now handled in the layout.
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
};
