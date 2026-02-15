import { ReactNode } from "react";

interface AlertsViewProps {
  children: ReactNode;
}

const AlertsView = ({ children }: AlertsViewProps) => {
  return <section className="space-y-4 fade-in">{children}</section>;
};

export default AlertsView;
