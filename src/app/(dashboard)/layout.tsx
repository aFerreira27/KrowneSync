
import { DashboardProvider } from '@/components/dashboard/dashboard-provider';
import { DashboardClientLayout } from '@/components/dashboard/dashboard-client-layout';
import React from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <DashboardProvider>
      <DashboardClientLayout>
        {children}
      </DashboardClientLayout>
    </DashboardProvider>
  );
}
