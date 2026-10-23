import pandas as pd

# 1. Load the .jsonl file into a DataFrame
df = pd.read_json('answer/ragas_faithfulness_scores_e0.jsonl', lines=True)

# 2. Calculate the Overall Average Faithfulness
overall_avg = df['faithfulness'].mean()
print(f"Overall Average Faithfulness: {overall_avg:.4f}")

# 3. Calculate Category-wise Average Faithfulness
# (Replace 'category' with your actual category column name, 
# or use 'judge' if you want to group by the evaluation model)
group_column = 'category' if 'category' in df.columns else 'judge'

category_avg = df.groupby(group_column)['faithfulness'].mean()
print(f"\nAverage Faithfulness by {group_column.capitalize()}:")
print(category_avg)