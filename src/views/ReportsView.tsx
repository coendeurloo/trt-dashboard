import { ReactNode } from "react";

interface ReportsViewProps {
  children: ReactNode;
}

const ReportsView = ({ children }: ReportsViewProps) => {
  return <section className="space-y-3 fade-in">{children}</section>;
};

export default ReportsView;
