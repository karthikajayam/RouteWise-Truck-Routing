export default function StatCard({ icon: Icon, label, value, detail, tone = "teal" }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
      <div className="stat-content">
        <p>{label}</p><h3>{value}</h3><span>{detail}</span>
      </div>
    </article>
  );
}
