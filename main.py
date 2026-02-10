totals = {"食費": 0, "交通": 0, "趣味": 0}

category = input("カテゴリ（食費/交通/趣味）: ")
amount = int(input("金額: "))

if category in totals:
    totals[category] += amount
    print("登録OK:", totals)
else:
    print("そのカテゴリはないよ")

# 家計ミニアプリ（Day3）
totals = {}  # 例: {"食費": 1200, "家賃": 50000}

print("家計ミニアプリへようこそ")
print("コマンド: add / show / exit")

while True:
    cmd = input("\nコマンドを入力: ").strip().lower()

    if cmd == "add":
        category = input("カテゴリ: ").strip()
        amount_str = input("金額（数字）: ").strip()

        if not amount_str.isdigit():
            print("金額は数字だけで入力してね（例: 1200）")
            continue

        amount = int(amount_str)

        # カテゴリがなければ0で作ってから足す
        totals[category] = totals.get(category, 0) + amount
        print(f"登録OK：{category} に {amount} 円")

    elif cmd == "show":
        if not totals:
            print("まだ何も登録されてないよ")
            continue

        print("\n--- 集計 ---")
        total_sum = 0
        for category, amount in totals.items():
            print(f"{category}: {amount} 円")
            total_sum += amount
        print("------------")
        print(f"合計: {total_sum} 円")

    elif cmd == "exit":
        print("終了！おつかれさま")
        break

    else:
        print("コマンドは add / show / exit だよ")
