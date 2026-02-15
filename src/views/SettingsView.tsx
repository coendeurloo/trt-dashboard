import { ReactNode } from "react";

interface SettingsViewProps {
  children: ReactNode;
}

const SettingsView = ({ children }: SettingsViewProps) => {
  return <section className="space-y-3 fade-in">{children}</section>;
};

export default SettingsView;
