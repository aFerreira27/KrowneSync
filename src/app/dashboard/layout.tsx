
import { DashboardClientLayout } from '@/components/dashboard/dashboard-client-layout';
import React from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
