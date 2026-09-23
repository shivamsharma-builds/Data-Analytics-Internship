import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import "./styles.css";

const API = "http://localhost:8000/api";

function App() {
  const [overview, setOverview] = useState(null);
  const [eda, setEda] = useState(null);
  const [model, setModel] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState(null);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [o, e, m] = await Promise.all([
        axios.get(`${API}/overview`),
        axios.get(`${API}/eda`),
        axios.get(`${API}/model`)
      ]);
      setOverview(o.data);
      setEda(e.data);
      setModel(m.data);
      setNotice("");
    } catch (err) {
      setNotice(err.response?.data?.error || "Backend is unavailable. Start Flask on port 8000 and upload the Kaggle CSV.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, []);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/upload`, form);
      setNotice(`${res.data.message} ${res.data.rows.toLocaleString()} rows loaded.`);
      await loadDashboard();
    } catch (err) {
      setNotice(err.response?.data?.error || "Upload failed.");
    }
  }

  async function runSamplePrediction() {
    const employee = {
      Age: 29, BusinessTravel: "Travel_Rarely", DailyRate: 800,
      Department: "Research & Development", DistanceFromHome: 5,
      Education: 3, EducationField: "Life Sciences", EnvironmentSatisfaction: 3,
      Gender: "Male", HourlyRate: 70, JobInvolvement: 3, JobLevel: 1,
      JobRole: "Research Scientist", JobSatisfaction: 3,
      MaritalStatus: "Single", MonthlyIncome: 3000, MonthlyRate: 14000,
      NumCompaniesWorked: 2, OverTime: "No", PercentSalaryHike: 14,
      PerformanceRating: 3, RelationshipSatisfaction: 3, StockOptionLevel: 0,
      TotalWorkingYears: 6, TrainingTimesLastYear: 3, WorkLifeBalance: 3,
      YearsAtCompany: 3, YearsInCurrentRole: 2, YearsSinceLastPromotion: 1,
      YearsWithCurrManager: 2
    };
    try {
      const res = await axios.post(`${API}/predict`, { employee });
      setPrediction(res.data);
    } catch (err) {
      setNotice(err.response?.data?.error || "Prediction failed.");
    }
  }

  const departmentPie = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.departments).map(([name, value]) => ({ name, value }));
  }, [overview]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="eyebrow">PEOPLE ANALYTICS • MACHINE LEARNING</div>
          <h1>IBM HR Attrition Intelligence</h1>
          <p>Interactive employee attrition analysis and logistic-regression risk scoring.</p>
        </div>
        <label className="uploadButton">
          Upload IBM HR CSV
          <input type="file" accept=".csv" onChange={uploadFile} />
        </label>
      </header>

      {notice && <div className="notice">{notice}</div>}

      {loading && <div className="loading">Loading dashboard…</div>}

      {!loading && overview && eda && (
        <>
          <section className="cards">
            <Kpi label="Employees" value={overview.rows.toLocaleString()} />
            <Kpi label="Attrition rate" value={`${overview.attrition_rate}%`} />
            <Kpi label="Attrition cases" value={overview.attrition_yes.toLocaleString()} />
            <Kpi label="Departments" value={Object.keys(overview.departments).length} />
            <Kpi label="Job roles" value={Object.keys(overview.roles).length} />
          </section>

          <section className="grid">
            <Panel title="Attrition by Department">
              <HorizontalChart data={eda.by_department} />
            </Panel>
            <Panel title="Attrition by Overtime">
              <HorizontalChart data={eda.by_overtime} />
            </Panel>
            <Panel title="Attrition by Business Travel">
              <HorizontalChart data={eda.by_travel} />
            </Panel>
            <Panel title="Attrition by Job Role">
              <HorizontalChart data={eda.by_job_role} height={340} />
            </Panel>
            <Panel title="Attrition by Age">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={eda.by_age}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="value" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Employee Distribution by Department">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={departmentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label>
                    {departmentPie.map((_, i) => <Cell key={i} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </section>

          {model && (
            <section className="modelSection">
              <Panel title="Logistic Regression Evaluation">
                <div className="metrics">
                  {Object.entries(model.metrics).map(([key, value]) => (
                    <div className="metric" key={key}>
                      <strong>{(value * 100).toFixed(1)}%</strong>
                      <span>{key.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
                <div className="matrix">
                  <div>
                    <h3>Confusion Matrix</h3>
                    <p>Rows = actual class; columns = predicted class.</p>
                  </div>
                  <table>
                    <thead><tr><th></th><th>Pred. No</th><th>Pred. Yes</th></tr></thead>
                    <tbody>
                      <tr><th>Actual No</th><td>{model.confusion_matrix[0][0]}</td><td>{model.confusion_matrix[0][1]}</td></tr>
                      <tr><th>Actual Yes</th><td>{model.confusion_matrix[1][0]}</td><td>{model.confusion_matrix[1][1]}</td></tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
            </section>
          )}

          <section className="predict">
            <Panel title="Employee Risk Predictor">
              <p className="muted">Run a sample prediction to verify the complete frontend → Flask → ML pipeline.</p>
              <button onClick={runSamplePrediction}>Run Sample Prediction</button>
              {prediction && (
                <div className={`risk ${prediction.risk_tier.toLowerCase()}`}>
                  <div><span>Risk tier</span><strong>{prediction.risk_tier}</strong></div>
                  <div><span>Churn probability</span><strong>{prediction.risk_percent}%</strong></div>
                  <p>{prediction.recommendation}</p>
                </div>
              )}
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return <div className="card"><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, children }) {
  return <div className="panel"><h2>{title}</h2>{children}</div>;
}

function HorizontalChart({ data, height = 270 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit="%" />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => `${v}%`} />
        <Bar dataKey="value" radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

createRoot(document.getElementById("root")).render(<App />);
