import pandas as pd

def extract_known_ids_from_csv(csv_path: str) -> list[str]:
    df = pd.read_csv(csv_path)
    # Assuming the first column contains the Pimly IDs
    return df.iloc[:, 0].dropna().astype(str).tolist()