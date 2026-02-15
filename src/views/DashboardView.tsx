import { ReactNode } from "react";

interface DashboardViewProps {
  children: ReactNode;
}

const DashboardView = ({ children }: DashboardViewProps) => {
  return <section className="space-y-3 fade-in">{children}</section>;
};

export default DashboardView;
