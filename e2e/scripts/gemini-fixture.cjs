const nock = require("nock").default;

if (
  process.env.WHYLINT_E2E !== "1" ||
  process.env.GEMINI_MODEL !== "fixture-gemini" ||
  process.env.GEMINI_API_KEY !== "whylint-fixture-gemini-key"
) {
  throw new Error("The Gemini fixture requires the disposable test stack");
}

let sequence = 0;

function generateQuestions(data) {
  const batch = ++sequence;
  const language = data.language === "en" ? "en" : "ja";
  const difficulty = data.preferences?.difficulty ?? "beginner";
  const japanese = language === "ja";
  const value = batch + 3;
  const multiplier = (batch % 3) + 2;
  const total = value * multiplier;
  const remainder = value % 2;
  const tasks = [
    {
      title: japanese ? "計算の順序" : "Arithmetic data flow",
      prompt: japanese
        ? "この計算で最後に表示される数値を選んでください。"
        : "Which number is displayed after these arithmetic steps?",
      code: `value = ${value}\nresult = value * ${multiplier}\nprint(result)`,
      codeLanguage: "Python",
      topics: ["general", "logic"],
      format: "choice",
      options: [String(total), String(value + multiplier), String(total + 1)],
      correctOption: 0,
      explanation: japanese
        ? "変数の値に係数を掛けた結果が表示されます。"
        : "The result multiplies the variable by the coefficient.",
    },
    {
      title: japanese ? "配列の出力" : "Array output",
      prompt: japanese
        ? "この配列処理が出力する文字列はどれですか？"
        : "Which string does this array transformation print?",
      code: `const values = [${value}, ${value + 1}];\nconsole.log(values.map(value => value * ${multiplier}).join(','));`,
      codeLanguage: "JavaScript",
      topics: ["JavaScript", "arrays"],
      format: "predict_output",
      options: [
        `${total},${(value + 1) * multiplier}`,
        `${value},${value + 1}`,
        "undefined",
      ],
      correctOption: 0,
      explanation: japanese
        ? "mapで各要素を変換した後、joinで文字列にします。"
        : "map transforms each item before join combines the values into a string.",
    },
    {
      title: japanese ? "条件分岐の結果" : "Conditional selection",
      prompt: japanese
        ? "条件を確認した後、どちらのラベルが出力されますか？"
        : "Which label is printed after the condition is evaluated?",
      code: `const score = ${value};\nconst label = score >= ${value + (batch % 2)} ? 'ready' : 'practice';\nconsole.log(label);`,
      codeLanguage: "JavaScript",
      topics: ["JavaScript", "conditions"],
      format: "choice",
      options: [
        batch % 2 === 0 ? "ready" : "practice",
        batch % 2 === 0 ? "practice" : "ready",
        "undefined",
      ],
      correctOption: 0,
      explanation: japanese
        ? "比較が真ならready、偽ならpracticeを選びます。"
        : "The comparison selects ready when true and practice when false.",
    },
    {
      title: japanese ? "余りと真偽値" : "Remainder and booleans",
      prompt: japanese
        ? "最後の比較はTrueになりますか？"
        : "Does the final remainder comparison evaluate to True?",
      code: `number = ${value}\nis_even = number % 2 == 0\nprint(is_even)`,
      codeLanguage: "Python",
      topics: ["Python", "booleans"],
      format: "true_false",
      options: japanese ? ["正しい", "誤り"] : ["True", "False"],
      correctOption: remainder === 0 ? 0 : 1,
      explanation: japanese
        ? "2で割った余りが0の数は偶数です。"
        : "An integer is even when its remainder after division by two is zero.",
    },
    {
      title: japanese ? "配列の境界" : "Array loop boundary",
      prompt: japanese
        ? "配列の範囲外までループさせるバグのある行を選んでください。"
        : "Which line lets the loop reach past the end of the array?",
      code: `const values = [${value}, ${value + 1}, ${value + 2}];\nfor (let index = 0; index <= values.length; index++) {\n  console.log(values[index]);\n}`,
      codeLanguage: "JavaScript",
      topics: ["JavaScript", "loops"],
      format: "spot_bug",
      options: ["1", "2", "3"],
      correctOption: 1,
      explanation: japanese
        ? "添字はlengthより小さい間だけ有効です。"
        : "Valid indices are smaller than length, so the loop condition must use <.",
    },
  ];
  const questions = tasks.map((task, index) => {
    const { explanation, ...question } = task;
    return {
      ...question,
      concept: `fixture-${batch}-${index}`,
      difficulty,
      language,
      referenceAnswer: explanation,
      rubric: [
        japanese ? "処理の順序を説明する。" : "Explain the operation sequence.",
        japanese
          ? "結果につながる仕組みを説明する。"
          : "Connect the mechanism to the result.",
      ],
      quickExplanation: explanation,
    };
  });
  if (data.preferences?.technologies?.includes("VarietyFixture")) {
    const https = {
      code: null,
      codeLanguage: null,
      topics: ["general", "security", "HTTP"],
      difficulty,
      language,
      format: "choice",
      options: [
        "It encrypts network traffic",
        "It compresses images",
        "It removes passwords",
      ],
      correctOption: 0,
      referenceAnswer:
        "HTTPS encrypts communication to protect data in transit.",
      rubric: [
        "Describe encryption in transit.",
        "Explain protection against eavesdropping.",
      ],
      quickExplanation:
        "HTTPS encrypts communication to protect data in transit.",
      concept: "https-encryption",
    };
    return {
      questions: [
        {
          ...https,
          title: "Role of HTTPS Encryption",
          prompt:
            "Why does a secure website use HTTPS instead of HTTP when handling personal user data? Choose the best explanation.",
        },
        {
          ...https,
          title: "Preventing Eavesdropping with HTTPS",
          prompt:
            "Why should a website use HTTPS instead of standard HTTP when transmitting personal data? Choose the best reason and explain why.",
        },
        ...questions.slice(0, 3),
      ],
    };
  }
  return { questions };
}

function answerFollowUp(data) {
  return {
    answer:
      data.question?.language === "en"
        ? `Fixture tutor: ${String(data.followUp).slice(0, 80)}`
        : `フィクスチャの解説：${String(data.followUp).slice(0, 80)}`,
  };
}

function assessAnswer(data) {
  const passed = String(data.answer).includes("fixture-pass");
  const japanese = data.question?.language !== "en";
  return {
    score: passed ? 9 : 6,
    feedback: japanese
      ? passed
        ? "仕組みをよく説明できています。"
        : "理解の土台はできています。もう一度考えてみましょう。"
      : passed
        ? "You explained the mechanism well."
        : "You have a foundation. Try explaining the mechanism again.",
    improvements: [
      japanese
        ? "各リクエストが独立している点を例で補足しましょう。"
        : "Add an example showing that each request is independent.",
    ],
    explanation: japanese
      ? "HTTP のリクエストは独立しているため、サーバーは毎回認証情報を確認します。"
      : "HTTP requests are independent, so the server verifies authentication for every request.",
  };
}

function reviewQuestion(data) {
  const question = data.question ?? data.input ?? data;
  const approved = !String(question.title).includes("fixture-reject");
  return {
    approved,
    referenceAnswer: approved
      ? "The service processes independent requests, and each request needs a valid authentication context."
      : "",
    rubric: approved
      ? [
          "Explain independent requests.",
          "Explain why credentials must be verified.",
        ]
      : [],
    reason: approved
      ? "This question has a clear, assessable explanation."
      : "The fixture question is not assessable.",
    correctOption:
      approved && Array.isArray(question.options)
        ? (question.correctOption ?? 0)
        : null,
    quickExplanation:
      approved && Array.isArray(question.options)
        ? "Each request is verified independently."
        : null,
  };
}

nock("https://generativelanguage.googleapis.com")
  .persist()
  .post("/v1beta/models/fixture-gemini:generateContent")
  .reply(async (request) => {
    if (
      request.headers.get("x-goog-api-key") !== "whylint-fixture-gemini-key"
    ) {
      return [403, { error: { message: "Invalid fixture configuration" } }];
    }
    const requestBody = await request.json();
    let data;
    try {
      data = JSON.parse(requestBody.contents[0].parts[0].text);
    } catch {
      return [400, { error: { message: "Unexpected fixture request" } }];
    }
    const result =
      data.operation === "generateQuestions"
        ? generateQuestions(data)
        : data.operation === "assessAnswer"
          ? assessAnswer(data)
          : data.operation === "reviewQuestion"
            ? reviewQuestion(data)
            : data.operation === "answerFollowUp"
              ? answerFollowUp(data)
              : null;
    if (!result)
      return [400, { error: { message: "Unknown fixture operation" } }];
    return [
      200,
      {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [{ text: JSON.stringify(result) }],
            },
          },
        ],
      },
    ];
  });
