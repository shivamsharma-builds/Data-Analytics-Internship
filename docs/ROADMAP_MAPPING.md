# Roadmap Mapping

The supplied project roadmap describes an e-commerce/RFM project. This implementation adapts the applicable parts to the IBM HR Attrition dataset.

| Roadmap area | IBM HR implementation |
|---|---|
| Data acquisition | Kaggle IBM HR CSV upload |
| Data cleaning | Column normalization, whitespace cleanup, required-column validation |
| EDA | Department, role, overtime, travel, marital status and age attrition analysis |
| Customer-level RFM | Not applicable to employee HR data; replaced by employee-level HR features |
| Predictive ML | Logistic Regression |
| Evaluation | Accuracy, precision, recall, F1, ROC-AUC, confusion matrix |
| Interactive UI | React + Vite |
| Backend | Flask REST API |
| Risk scoring | High >=70%, Medium 40–70%, Low <40% |

The roadmap specifically requires an interactive UI and a machine-learning churn/risk workflow; those requirements are preserved while the domain is correctly changed from customers/orders to employees.
