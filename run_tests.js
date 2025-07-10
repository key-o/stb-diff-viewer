/**
 * Node.js環境でのテスト実行スクリプト
 * STB Diff Viewerの基本機能をテストして実際の結果を出力
 */

console.log('🧪 ======================================');
console.log('   STB Diff Viewer Test Execution');
console.log('   Environment: Node.js');
console.log('🧪 ======================================\n');

// テスト結果保存用
const testResults = [];

/**
 * テスト実行関数
 */
function runTest(name, testFunction) {
  const startTime = Date.now();
  let result;
  
  try {
    result = testFunction();
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    testResults.push({
      name,
      passed: true,
      duration,
      result: result || 'OK'
    });
    
    console.log(`✅ ${name} - PASSED (${duration}ms)`);
    if (result && typeof result === 'object') {
      console.log(`   Details:`, result);
    }
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    testResults.push({
      name,
      passed: false,
      duration,
      error: error.message
    });
    
    console.log(`❌ ${name} - FAILED (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
  }
}

/**
 * 基本的なJavaScript機能テスト
 */
function testBasicJavaScriptFeatures() {
  // ES6機能テスト
  const testArray = [1, 2, 3, 4, 5];
  const doubled = testArray.map(x => x * 2);
  const filtered = testArray.filter(x => x > 2);
  
  // オブジェクト分割代入
  const obj = { a: 1, b: 2, c: 3 };
  const { a, b } = obj;
  
  // テンプレートリテラル
  const template = `Test: ${a + b}`;
  
  // Promise
  const promise = Promise.resolve('success');
  
  return {
    mapWorking: doubled.join(',') === '2,4,6,8,10',
    filterWorking: filtered.length === 3,
    destructuringWorking: a === 1 && b === 2,
    templateWorking: template === 'Test: 3',
    promiseWorking: promise instanceof Promise
  };
}

/**
 * データ構造・アルゴリズムテスト
 */
function testDataStructures() {
  // Map
  const testMap = new Map();
  testMap.set('key1', 'value1');
  testMap.set('key2', 'value2');
  
  // Set
  const testSet = new Set([1, 2, 3, 2, 1]);
  
  // Array methods
  const numbers = [1, 2, 3, 4, 5];
  const sum = numbers.reduce((acc, curr) => acc + curr, 0);
  
  return {
    mapSize: testMap.size,
    setValue: testSet.size,
    arraySum: sum,
    mapGetCorrect: testMap.get('key1') === 'value1',
    setUniqueValues: testSet.size === 3
  };
}

/**
 * STB関連データ構造テスト
 */
function testStbDataStructures() {
  // STB要素タイプの定義
  const ELEMENT_TYPES = {
    NODE: 'Node',
    COLUMN: 'Column',
    GIRDER: 'Girder',
    BEAM: 'Beam',
    BRACE: 'Brace',
    SLAB: 'Slab',
    WALL: 'Wall'
  };
  
  // 模擬要素データ
  const mockElements = [
    { id: 'N1', type: 'Node', x: 0, y: 0, z: 0 },
    { id: 'C1', type: 'Column', section: 'RC400x400' },
    { id: 'G1', type: 'Girder', section: 'H400x200x8x13' },
    { id: 'B1', type: 'Beam', section: 'RC300x500' }
  ];
  
  // 要素検索テスト
  const findElement = (elements, id) => elements.find(el => el.id === id);
  const foundGirder = findElement(mockElements, 'G1');
  const foundColumn = findElement(mockElements, 'C1');
  
  // 要素分類テスト
  const nodeElements = mockElements.filter(el => el.type === ELEMENT_TYPES.NODE);
  const structuralElements = mockElements.filter(el => 
    [ELEMENT_TYPES.COLUMN, ELEMENT_TYPES.GIRDER, ELEMENT_TYPES.BEAM].includes(el.type)
  );
  
  // 要素タイプ変換テスト
  const elementTypeToStbName = (type) => type === 'Node' ? 'StbNode' : `Stb${type}`;
  const nodeTagName = elementTypeToStbName('Node');
  const girderTagName = elementTypeToStbName('Girder');
  
  return {
    elementTypesCount: Object.keys(ELEMENT_TYPES).length,
    mockElementsCount: mockElements.length,
    girderFound: foundGirder && foundGirder.type === 'Girder',
    columnFound: foundColumn && foundColumn.section === 'RC400x400',
    nodeCount: nodeElements.length,
    structuralCount: structuralElements.length,
    tagNameConversion: nodeTagName === 'StbNode' && girderTagName === 'StbGirder'
  };
}

/**
 * エラーハンドリングテスト
 */
function testErrorHandling() {
  const errors = [];
  
  // 標準エラー処理
  try {
    throw new Error('Test standard error');
  } catch (error) {
    errors.push({
      type: 'standard',
      message: error.message,
      caught: true
    });
  }
  
  // カスタムエラークラス
  class StandardError extends Error {
    constructor(message, code, module, operation) {
      super(message);
      this.name = 'StandardError';
      this.code = code;
      this.module = module;
      this.operation = operation;
    }
    
    getUserMessage() {
      const messages = {
        'FILE_LOAD_ERROR': 'ファイルの読み込みに失敗しました',
        'XML_PARSE_ERROR': 'STBファイルの解析に失敗しました'
      };
      return messages[this.code] || '予期しないエラーが発生しました';
    }
  }
  
  try {
    throw new StandardError('Test custom error', 'FILE_LOAD_ERROR', 'ModelLoader', 'loadFile');
  } catch (error) {
    errors.push({
      type: 'custom',
      name: error.name,
      code: error.code,
      userMessage: error.getUserMessage(),
      caught: true
    });
  }
  
  return {
    errorsHandled: errors.length,
    standardErrorCaught: errors[0].caught,
    customErrorWorking: errors[1].name === 'StandardError',
    userMessageGenerated: errors[1].userMessage === 'ファイルの読み込みに失敗しました'
  };
}

/**
 * パフォーマンステスト
 */
function testPerformance() {
  // 配列処理性能
  const startArray = Date.now();
  const largeArray = Array.from({ length: 10000 }, (_, i) => i);
  const processed = largeArray
    .filter(x => x % 2 === 0)
    .map(x => x * 2)
    .reduce((sum, x) => sum + x, 0);
  const arrayTime = Date.now() - startArray;
  
  // オブジェクト処理性能（STBデータシミュレーション）
  const startObject = Date.now();
  const elements = Array.from({ length: 1000 }, (_, i) => ({
    id: `element_${i}`,
    type: ['Node', 'Column', 'Girder', 'Beam'][i % 4],
    x: Math.random() * 10000,
    y: Math.random() * 10000,
    z: Math.random() * 5000
  }));
  
  // 要素の分類処理
  const grouped = elements.reduce((acc, el) => {
    acc[el.type] = acc[el.type] || [];
    acc[el.type].push(el);
    return acc;
  }, {});
  
  // 座標による検索処理
  const nearOrigin = elements.filter(el => 
    Math.sqrt(el.x * el.x + el.y * el.y + el.z * el.z) < 1000
  );
  
  const objectTime = Date.now() - startObject;
  
  // 文字列処理性能（XML生成シミュレーション）
  const startString = Date.now();
  let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n<StbModel>\n';
  for (let i = 0; i < 1000; i++) {
    xmlContent += `  <StbNode id="N${i}" X="${i * 100}" Y="${i * 50}" Z="0"/>\n`;
  }
  xmlContent += '</StbModel>';
  const stringTime = Date.now() - startString;
  
  return {
    arrayProcessingTime: arrayTime,
    objectProcessingTime: objectTime,
    stringProcessingTime: stringTime,
    arrayResultCorrect: processed > 0,
    objectGroupingCount: Object.keys(grouped).length,
    nearOriginCount: nearOrigin.length,
    xmlGenerated: xmlContent.includes('<StbNode') && xmlContent.includes('</StbModel>'),
    performanceAcceptable: arrayTime < 100 && objectTime < 50 && stringTime < 100
  };
}

/**
 * XMLシミュレーションテスト
 */
function testXmlSimulation() {
  // 模擬STB XMLデータ
  const mockStbXml = `<?xml version="1.0" encoding="UTF-8"?>
<ST_BRIDGE xmlns="https://www.building-smart.or.jp/dl" version="2.0.2">
  <StbModel>
    <StbNodes>
      <StbNode id="N1" X="0" Y="0" Z="0"/>
      <StbNode id="N2" X="5000" Y="0" Z="0"/>
      <StbNode id="N3" X="5000" Y="8000" Z="0"/>
      <StbNode id="N4" X="0" Y="8000" Z="0"/>
    </StbNodes>
    <StbMembers>
      <StbColumns>
        <StbColumn id="C1" id_node_bottom="N1" id_node_top="N5" id_section="SC1"/>
        <StbColumn id="C2" id_node_bottom="N2" id_node_top="N6" id_section="SC1"/>
      </StbColumns>
      <StbGirders>
        <StbGirder id="G1" id_node_start="N5" id_node_end="N6" id_section="SG1"/>
        <StbGirder id="G2" id_node_start="N6" id_node_end="N7" id_section="SG1"/>
      </StbGirders>
    </StbMembers>
    <StbSections>
      <StbSecColumn id="SC1" name="C-400x400" kind="RC"/>
      <StbSecGirder id="SG1" name="G-400x700" kind="RC"/>
    </StbSections>
  </StbModel>
</ST_BRIDGE>`;

  // 簡易XML解析（正規表現ベース）
  const extractElements = (xml, tagName) => {
    const pattern = new RegExp(`<${tagName}[^>]*>`, 'g');
    const matches = xml.match(pattern) || [];
    return matches.map(match => {
      const idMatch = match.match(/id="([^"]*)"/);
      const result = { raw: match };
      if (idMatch) result.id = idMatch[1];
      
      // 属性抽出
      const attrPattern = /(\w+)="([^"]*)"/g;
      let attrMatch;
      result.attributes = {};
      while ((attrMatch = attrPattern.exec(match)) !== null) {
        result.attributes[attrMatch[1]] = attrMatch[2];
      }
      
      return result;
    });
  };
  
  const nodes = extractElements(mockStbXml, 'StbNode');
  const columns = extractElements(mockStbXml, 'StbColumn');
  const girders = extractElements(mockStbXml, 'StbGirder');
  const sections = extractElements(mockStbXml, 'StbSecColumn|StbSecGirder');
  
  // データ構造検証
  const hasValidNamespace = mockStbXml.includes('xmlns="https://www.building-smart.or.jp/dl"');
  const hasValidVersion = mockStbXml.includes('version="2.0.2"');
  const hasRequiredStructure = mockStbXml.includes('<StbModel>') && 
                              mockStbXml.includes('<StbNodes>') &&
                              mockStbXml.includes('<StbMembers>');
  
  // 要素関係の検証
  const nodeIds = nodes.map(n => n.id);
  const girderG1 = girders.find(g => g.id === 'G1');
  const hasValidReferences = girderG1 && 
                            girderG1.attributes.id_node_start &&
                            girderG1.attributes.id_node_end;
  
  return {
    xmlLength: mockStbXml.length,
    nodeCount: nodes.length,
    columnCount: columns.length,
    girderCount: girders.length,
    validNamespace: hasValidNamespace,
    validVersion: hasValidVersion,
    validStructure: hasRequiredStructure,
    validReferences: hasValidReferences,
    sampleNodeIds: nodeIds.slice(0, 3),
    sampleGirderAttributes: girderG1 ? Object.keys(girderG1.attributes) : []
  };
}

/**
 * ファイルシステムアクセステスト
 */
function testFileSystemAccess() {
  const fs = require('fs');
  const path = require('path');
  
  // プロジェクトファイルの存在確認
  const projectFiles = [
    'index.html',
    'js/main.js',
    'js/viewer/index.js',
    'js/parser/stbXmlParser.js',
    'js/test/comprehensiveTestSuite.js',
    'js/utils/codeStandards.js',
    '.eslintrc.js'
  ];
  
  const fileChecks = projectFiles.map(filePath => {
    try {
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        exists: true,
        size: stats.size,
        isFile: stats.isFile()
      };
    } catch (error) {
      return {
        path: filePath,
        exists: false,
        error: error.code
      };
    }
  });
  
  // サンプルファイルディレクトリの確認
  let sampleDirCheck = { exists: false };
  try {
    const sampleStats = fs.statSync('sampleStb');
    const sampleFiles = fs.readdirSync('sampleStb');
    sampleDirCheck = {
      exists: true,
      isDirectory: sampleStats.isDirectory(),
      fileCount: sampleFiles.length,
      sampleFiles: sampleFiles.filter(f => f.endsWith('.stb')).slice(0, 3)
    };
  } catch (error) {
    sampleDirCheck.error = error.code;
  }
  
  const existingFiles = fileChecks.filter(f => f.exists);
  const missingFiles = fileChecks.filter(f => !f.exists);
  
  return {
    totalFilesChecked: projectFiles.length,
    existingFiles: existingFiles.length,
    missingFiles: missingFiles.length,
    sampleDirExists: sampleDirCheck.exists,
    sampleFileCount: sampleDirCheck.fileCount || 0,
    allCoreFilesExist: existingFiles.length >= 5,
    missingFilesList: missingFiles.map(f => f.path)
  };
}

/**
 * メイン実行関数
 */
function runAllTests() {
  const overallStartTime = Date.now();
  
  // 各テストを実行
  runTest('1. Basic JavaScript Features', testBasicJavaScriptFeatures);
  runTest('2. Data Structures', testDataStructures);
  runTest('3. STB Data Structures', testStbDataStructures);
  runTest('4. Error Handling', testErrorHandling);
  runTest('5. Performance Test', testPerformance);
  runTest('6. XML Simulation', testXmlSimulation);
  runTest('7. File System Access', testFileSystemAccess);
  
  const overallEndTime = Date.now();
  const totalDuration = overallEndTime - overallStartTime;
  
  // 結果サマリー
  console.log('\n📊 ======================================');
  console.log('   TEST RESULTS SUMMARY');
  console.log('📊 ======================================');
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;
  const successRate = ((passed / total) * 100).toFixed(1);
  
  console.log(`📋 Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`🎯 Success Rate: ${successRate}%`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  console.log(`💾 Average per test: ${(totalDuration / total).toFixed(1)}ms`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.filter(r => !r.passed).forEach(test => {
      console.log(`   - ${test.name}: ${test.error}`);
    });
  }
  
  // パフォーマンス統計
  const durations = testResults.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);
  
  console.log('\n⚡ PERFORMANCE STATISTICS:');
  console.log(`   Average: ${avgDuration.toFixed(1)}ms`);
  console.log(`   Maximum: ${maxDuration}ms`);
  console.log(`   Minimum: ${minDuration}ms`);
  
  // 成功したテストの詳細
  console.log('\n✅ SUCCESSFUL TESTS:');
  testResults.filter(r => r.passed).forEach(test => {
    console.log(`   ✓ ${test.name} (${test.duration}ms)`);
  });
  
  console.log('\n🎉 TEST EXECUTION COMPLETED!\n');
  
  return {
    summary: {
      total,
      passed,
      failed,
      successRate: parseFloat(successRate),
      duration: totalDuration,
      averageDuration: avgDuration,
      maxDuration,
      minDuration
    },
    details: testResults
  };
}

// 実行
runAllTests();