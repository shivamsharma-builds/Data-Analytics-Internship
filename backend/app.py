from pathlib import Path
import io
import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE.parent / "data"
MODEL_PATH = BASE / "model.joblib"
DATA_DIR.mkdir(exist_ok=True)

DROP_COLUMNS = ["EmployeeCount", "EmployeeNumber", "Over18", "StandardHours"]
TARGET = "Attrition"
REQUIRED = ["Attrition", "Department", "JobRole", "OverTime"]

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].astype(str).str.strip()
    for col in DROP_COLUMNS:
        if col in df.columns:
            df.drop(columns=col, inplace=True)
    return df


def find_dataset():
    csvs = sorted(DATA_DIR.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(
            "No CSV dataset found. Upload the IBM HR Attrition CSV from the dashboard "
            "or place it in the project's data folder."
        )
    return csvs[0]


def load_dataset():
    return clean_dataframe(pd.read_csv(find_dataset()))


def validate_dataset(df):
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    values = set(df[TARGET].dropna().astype(str).str.strip().unique())
    if not values.issubset({"Yes", "No"}):
        raise ValueError("Attrition must contain only Yes/No values.")
    if len(values) < 2:
        raise ValueError("Attrition needs both Yes and No classes.")


def build_model(df):
    validate_dataset(df)
    X = df.drop(columns=[TARGET])
    y = df[TARGET].map({"Yes": 1, "No": 0}).astype(int)

    categorical = X.select_dtypes(include=["object"]).columns.tolist()
    numeric = [c for c in X.columns if c not in categorical]

    preprocessor = ColumnTransformer([
        ("num", StandardScaler(), numeric),
        ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
    ])

    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", LogisticRegression(
            max_iter=2500, class_weight="balanced", random_state=42
        )),
    ])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )
    pipeline.fit(X_train, y_train)

    pred = pipeline.predict(X_test)
    prob = pipeline.predict_proba(X_test)[:, 1]
    cm = confusion_matrix(y_test, pred, labels=[0, 1]).tolist()

    metrics = {
        "accuracy": float(accuracy_score(y_test, pred)),
        "precision": float(precision_score(y_test, pred, zero_division=0)),
        "recall": float(recall_score(y_test, pred, zero_division=0)),
        "f1": float(f1_score(y_test, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, prob)),
    }

    joblib.dump(pipeline, MODEL_PATH)
    return pipeline, metrics, cm


def get_model(df):
    # Always retrain after a new CSV upload so model and data stay synchronized.
    return build_model(df)


def rate_by(df, column):
    result = (
        df.groupby(column, dropna=False)[TARGET]
        .apply(lambda s: round((s == "Yes").mean() * 100, 2))
        .sort_values(ascending=False)
    )
    return [{"name": str(k), "value": float(v)} for k, v in result.items()]


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "dataset_present": any(DATA_DIR.glob("*.csv"))})


@app.get("/api/overview")
def overview():
    try:
        df = load_dataset()
        validate_dataset(df)
        yes = int((df[TARGET] == "Yes").sum())
        no = int((df[TARGET] == "No").sum())
        return jsonify({
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "attrition_yes": yes,
            "attrition_no": no,
            "attrition_rate": round(100 * yes / len(df), 2),
            "departments": df["Department"].value_counts().to_dict(),
            "roles": df["JobRole"].value_counts().to_dict(),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 404


@app.get("/api/eda")
def eda():
    try:
        df = load_dataset()
        validate_dataset(df)
        return jsonify({
            "by_department": rate_by(df, "Department"),
            "by_job_role": rate_by(df, "JobRole"),
            "by_overtime": rate_by(df, "OverTime"),
            "by_travel": rate_by(df, "BusinessTravel"),
            "by_marital": rate_by(df, "MaritalStatus"),
            "by_gender": rate_by(df, "Gender"),
            "by_age": [
                {"name": int(k), "value": round(float(v), 2)}
                for k, v in df.groupby("Age")[TARGET].apply(lambda s: (s == "Yes").mean() * 100).items()
            ],
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 404


@app.post("/api/upload")
def upload():
    if "file" not in request.files:
        return jsonify({"error": "Select a CSV file."}), 400

    uploaded = request.files["file"]
    if not uploaded.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported."}), 400

    try:
        df = clean_dataframe(pd.read_csv(io.BytesIO(uploaded.read())))
        validate_dataset(df)
        output = DATA_DIR / "ibm_hr_employee_attrition.csv"
        df.to_csv(output, index=False)
        if MODEL_PATH.exists():
            MODEL_PATH.unlink()
        return jsonify({
            "message": "Dataset uploaded successfully.",
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "filename": uploaded.filename,
        })
    except Exception as exc:
        return jsonify({"error": f"Invalid dataset: {exc}"}), 400


@app.get("/api/model")
def model_info():
    try:
        df = load_dataset()
        _, metrics, cm = get_model(df)
        return jsonify({"metrics": metrics, "confusion_matrix": cm})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/train")
def train_endpoint():
    return model_info()


@app.post("/api/predict")
def predict():
    try:
        df = load_dataset()
        validate_dataset(df)
        body = request.get_json(silent=True) or {}
        employee = body.get("employee", body)
        if not isinstance(employee, dict):
            return jsonify({"error": "Request must contain an employee object."}), 400

        pipeline, _, _ = get_model(df)
        feature_columns = [c for c in df.columns if c != TARGET]
        row = {c: employee.get(c, np.nan) for c in feature_columns}
        x = pd.DataFrame([row])

        for col in x.select_dtypes(include=["object"]).columns:
            x[col] = x[col].fillna("Unknown")

        probability = float(pipeline.predict_proba(x)[0, 1])
        if probability >= 0.70:
            tier = "High"
            recommendation = "Prioritize a retention conversation and review workload, overtime, travel and manager relationship signals."
        elif probability >= 0.40:
            tier = "Medium"
            recommendation = "Review engagement, overtime, career progression and compensation signals."
        else:
            tier = "Low"
            recommendation = "Maintain engagement and monitor for changes in the employee profile."

        return jsonify({
            "churn_probability": round(probability, 4),
            "risk_percent": round(probability * 100, 1),
            "risk_tier": tier,
            "recommendation": recommendation,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Endpoint not found."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
