import { Activity, Route, CloudSun, ShieldCheck, Settings, Truck, Zap, ArrowRight, ChevronDown } from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Truck size={24} /></div>
        <div><h1>RouteWise</h1><span>INTELLIGENT LOGISTICS</span></div>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">
        <a className="nav-link active" href="#dashboard"><Activity size={18} />Dashboard</a>
        <a className="nav-link" href="#route-planner"><Route size={18} />Route planner</a>
        <a className="nav-link" href="#weather"><CloudSun size={18} />Weather intelligence</a>
        <a className="nav-link" href="#risk"><ShieldCheck size={18} />Risk assessment</a>
      </nav>
      <div className="sidebar-bottom">
        <div className="upgrade-card">
          <div className="upgrade-icon"><Zap size={18} /></div>
          <h3>Smarter journeys</h3>
          <p>Plan around changing weather and road conditions.</p>
          <a href="#route-planner">Plan a route <ArrowRight size={15} /></a>
        </div>
        <a className="nav-link" href="#settings"><Settings size={18} />Settings</a>
        <div className="profile-row">
          <div className="profile-avatar">RW</div>
          <div className="profile-info"><strong>Fleet Operator</strong><span>Operations team</span></div>
          <ChevronDown size={16} />
        </div>
      </div>
    </aside>
  );
}
