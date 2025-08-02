/**
 * @fileoverview 重要度色分けの通り芯・階ワイヤーフレーム表示テスト
 *
 * このファイルは重要度色分けモードにおけるAxis（通り芯）とStory（階）の
 * ワイヤーフレーム表示が正しく動作するかをテストします。
 */

// テスト用のヘルパー関数
export function testAxisStoryWireframe() {
  console.group("🧪 Axis & Story Wireframe Test");

  // 重要度色分けモードでのマテリアル作成をテスト
  const testCases = [
    { elementType: "Axis", importance: "required", expectedWireframe: true },
    { elementType: "Story", importance: "optional", expectedWireframe: true },
    { elementType: "Column", importance: "required", expectedWireframe: false },
    { elementType: "Girder", importance: "optional", expectedWireframe: false },
  ];

  testCases.forEach((testCase, index) => {
    console.log(
      `Test ${index + 1}: ${testCase.elementType} (${testCase.importance})`
    );

    // マテリアル作成をテスト
    import("../viewer/rendering/materials.js")
      .then(({ createImportanceMaterial }) => {
        const material = createImportanceMaterial(testCase.importance, {
          elementType: testCase.elementType,
        });

        const actualWireframe = material.wireframe;
        const passed = actualWireframe === testCase.expectedWireframe;

        console.log(`  Expected wireframe: ${testCase.expectedWireframe}`);
        console.log(`  Actual wireframe: ${actualWireframe}`);
        console.log(`  Result: ${passed ? "✅ PASS" : "❌ FAIL"}`);

        if (!passed) {
          console.error(`  Test failed for ${testCase.elementType}`);
        }
      })
      .catch((error) => {
        console.error(`  Error testing ${testCase.elementType}:`, error);
      });
  });

  console.groupEnd();
}

/**
 * 現在のシーンでAxis/Storyの表示状態を確認
 */
export function inspectAxisStoryInScene() {
  console.group("🔍 Scene Inspection: Axis & Story Elements");

  // グローバル状態からシーンを取得
  const scene = window.globalState?.get("rendering.scene");
  if (!scene) {
    console.warn("Scene not available in global state");
    console.groupEnd();
    return;
  }

  const axisElements = [];
  const storyElements = [];

  // シーンを走査してAxis/Story要素を探す
  scene.traverse((object) => {
    if (object.userData && object.userData.elementType) {
      if (object.userData.elementType === "Axis") {
        axisElements.push(object);
      } else if (object.userData.elementType === "Story") {
        storyElements.push(object);
      }
    }
  });

  console.log(`Found ${axisElements.length} Axis elements`);
  console.log(`Found ${storyElements.length} Story elements`);

  // 各要素の詳細情報を表示
  [...axisElements, ...storyElements].forEach((element, index) => {
    const { elementType, importance, id, originalId } = element.userData;
    const isWireframe = element.material?.wireframe || false;
    const materialType = element.material?.type || "unknown";

    console.log(`Element ${index + 1}: ${elementType}`, {
      id: id || originalId || "unknown",
      importance: importance || "not set",
      wireframe: isWireframe,
      materialType: materialType,
      visible: element.visible,
      materialColor: element.material?.color?.getHexString() || "unknown",
    });
  });

  console.groupEnd();
}

/**
 * 重要度色分けモードの切り替えをテスト
 */
export function testImportanceColorModeToggle() {
  console.group("🎨 Importance Color Mode Toggle Test");

  // 現在の色分けモードを確認
  import("../colorModes.js")
    .then(({ getCurrentColorMode, setColorMode, COLOR_MODES }) => {
      const currentMode = getCurrentColorMode();
      console.log(`Current color mode: ${currentMode}`);

      if (currentMode !== COLOR_MODES.IMPORTANCE) {
        console.log("Switching to importance color mode...");
        setColorMode(COLOR_MODES.IMPORTANCE);

        // 少し待ってから結果を確認
        setTimeout(() => {
          console.log(`New color mode: ${getCurrentColorMode()}`);
          inspectAxisStoryInScene();
        }, 500);
      } else {
        console.log("Already in importance color mode");
        inspectAxisStoryInScene();
      }
    })
    .catch((error) => {
      console.error("Error testing color mode toggle:", error);
    });

  console.groupEnd();
}

/**
 * すべてのテストを実行
 */
export function runAllTests() {
  console.log("🚀 Starting Axis & Story Wireframe Tests");

  testAxisStoryWireframe();

  setTimeout(() => {
    testImportanceColorModeToggle();
  }, 1000);
}

// テスト関数をグローバルに公開（開発用）
if (typeof window !== "undefined") {
  window.testAxisStoryWireframe = testAxisStoryWireframe;
  window.inspectAxisStoryInScene = inspectAxisStoryInScene;
  window.testImportanceColorModeToggle = testImportanceColorModeToggle;
  window.runAllAxisStoryTests = runAllTests;

  console.log("🧪 Axis & Story wireframe test functions available:");
  console.log("  - window.testAxisStoryWireframe()");
  console.log("  - window.inspectAxisStoryInScene()");
  console.log("  - window.testImportanceColorModeToggle()");
  console.log("  - window.runAllAxisStoryTests()");
}
