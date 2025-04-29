import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "./materials.js"; // マテリアルをインポート

// ★★★ スケール定数を削除 ★★★
// const SCALE = 0.001; // mm to m

/**
 * 柱要素データに基づいて柱のメッシュを作成する
 * @param {Array} columnElements - 柱要素データの配列
 * @param {Map<string, THREE.Vector3>} nodes - 節点データのマップ (mm単位)
 * @param {Map<string, Object>} columnSections - 柱断面データのマップ
 * @param {Map<string, Object>} steelSections - 鋼材形状データのマップ (寸法はmm単位)
 * @returns {Array<THREE.Mesh>} 作成された柱メッシュの配列
 */
export function createColumnMeshes(
  columnElements,
  nodes,
  columnSections,
  steelSections
) {
  const meshes = [];

  for (const col of columnElements) {
    const bottomNode = nodes.get(col.id_node_bottom);
    const topNode = nodes.get(col.id_node_top);
    const sectionData = columnSections.get(col.id_section);

    // ★★★ sectionData の内容をログ出力 ★★★
    if (col.id === 71 || col.id_section === 1 || col.id_section === "1") {
      // 問題の柱/断面IDに絞るか、最初は全てログ出力
      console.log(
        `Column ${col.id}, Section ID ${col.id_section}: Retrieved sectionData:`,
        JSON.stringify(sectionData)
      );
    }

    if (!bottomNode || !topNode || !sectionData) {
      console.warn(`Skipping column ${col.id}: Missing node or section data.`);
      continue;
    }

    let geometry = null;
    const length = bottomNode.distanceTo(topNode);
    const direction = new THREE.Vector3()
      .subVectors(topNode, bottomNode)
      .normalize();

    // 断面情報に基づいてジオメトリを作成
    if (sectionData.shapeName && steelSections.has(sectionData.shapeName)) {
      // ★★★ 鋼材セクション処理に入るかログ出力 ★★★
      console.log(
        `Column ${col.id}: Trying Steel Section logic for shapeName: ${sectionData.shapeName}`
      );
      const steelShape = steelSections.get(sectionData.shapeName);
      // ★★★ steelShape の内容もログ出力 ★★★
      console.log(
        `Column ${col.id}: Steel Shape Data:`,
        JSON.stringify(steelShape)
      );

      // H形鋼の場合 (他の形状も同様に追加)
      if (
        steelShape.elementTag === "StbSecSteel_H" ||
        steelShape.shapeTypeAttr === "H"
      ) {
        // ★★★ スケーリングを削除 ★★★
        const H = parseFloat(steelShape.H);
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.tw);
        const tf = parseFloat(steelShape.tf);

        if (!isNaN(H) && !isNaN(B) && !isNaN(tw) && !isNaN(tf)) {
          // 簡単なBoxGeometryで代用（より正確な形状はShapeGeometryなどを使用）
          // geometry = new THREE.BoxGeometry(B, H, length); // これは向きが違う

          // 断面形状をShapeで定義 (XY平面上)
          const shape = new THREE.Shape();
          const halfB = B / 2;
          const halfH = H / 2;
          const halfTw = tw / 2;
          const halfTfOffset = halfH - tf;

          shape.moveTo(-halfB, halfH);
          shape.lineTo(halfB, halfH);
          shape.lineTo(halfB, halfTfOffset);
          shape.lineTo(halfTw, halfTfOffset);
          shape.lineTo(halfTw, -halfTfOffset);
          shape.lineTo(halfB, -halfTfOffset);
          shape.lineTo(halfB, -halfH);
          shape.lineTo(-halfB, -halfH);
          shape.lineTo(-halfB, -halfTfOffset);
          shape.lineTo(-halfTw, -halfTfOffset);
          shape.lineTo(-halfTw, halfTfOffset);
          shape.lineTo(-halfB, halfTfOffset);
          shape.closePath();

          const extrudeSettings = {
            steps: 1,
            depth: length,
            bevelEnabled: false,
          };
          geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          // ★★★ ExtrudeGeometryはZ方向に伸びるので、向きを調整する必要がある ★★★
          // デフォルトでは断面がXY平面、押し出しがZ方向
        }
        // ★★★ H形鋼の寸法とジオメトリ作成成否をログ出力 ★★★
        console.log(
          `Column ${
            col.id
          }: Creating H-Beam geometry with H=${H}, B=${B}, tw=${tw}, tf=${tf}. Geometry created: ${!!geometry}`
        );
      }
      // 他の鋼材形状 (Box, Pipe, etc.) の処理を追加
      else if (
        steelShape.elementTag === "StbSecSteel_BOX" ||
        steelShape.shapeTypeAttr === "BOX"
      ) {
        // ★★★ スケーリングを削除 ★★★
        const H = parseFloat(steelShape.A); // A or H
        const B = parseFloat(steelShape.B);
        // const t = parseFloat(steelShape.t); // 厚みは形状に直接使わないかも
        if (!isNaN(H) && !isNaN(B)) {
          geometry = new THREE.BoxGeometry(B, H, length);
        }
        // ★★★ Box形状の寸法とジオメトリ作成成否をログ出力 ★★★
        console.log(
          `Column ${
            col.id
          }: Creating Box geometry with H=${H}, B=${B}. Geometry created: ${!!geometry}`
        );
      }
      // ...
      else {
        // ★★★ どの鋼材タイプにも一致しなかった場合 ★★★
        console.log(
          `Column ${col.id}: Steel shape ${sectionData.shapeName} (Tag: ${steelShape.elementTag}, TypeAttr: ${steelShape.shapeTypeAttr}) did not match known types (H, BOX).`
        );
      }
    } else if (sectionData.concreteShapeData) {
      // ★★★ コンクリートセクション処理に入るかログ出力 ★★★
      console.log(`Column ${col.id}: Trying Concrete Section logic.`);
      // RC/SRC/CFT のコンクリート部分
      const concreteShape = sectionData.concreteShapeData;
      // ★★★ concreteShape の内容もログ出力 ★★★
      console.log(
        `Column ${col.id}: Concrete Shape Data:`,
        JSON.stringify(concreteShape)
      );

      // ★★★ 比較文字列を修正 ★★★
      if (concreteShape.type === "StbSecColumn_RC_Rect") {
        // ★★★ スケーリングを削除 ★★★
        const widthX = parseFloat(concreteShape.width_X);
        const widthY = parseFloat(concreteShape.width_Y);
        if (!isNaN(widthX) && !isNaN(widthY)) {
          geometry = new THREE.BoxGeometry(widthX, widthY, length);
        }
        // ★★★ Rect形状の寸法とジオメトリ作成成否をログ出力 ★★★
        console.log(
          `Column ${
            col.id
          }: Creating Rect geometry with widthX=${widthX}, widthY=${widthY}. Geometry created: ${!!geometry}`
        );
        // ★★★ 比較文字列を修正 (もし円形もRC/SRCなどプレフィックスが付く場合) ★★★
        // 例: else if (concreteShape.type === "StbSecColumn_RC_Circle") {
      } else if (concreteShape.type === "StbSecColumn_Circle") {
        // ← 必要に応じてここも修正
        // ★★★ スケーリングを削除 ★★★
        const D = parseFloat(concreteShape.D);
        if (!isNaN(D)) {
          geometry = new THREE.CylinderGeometry(D / 2, D / 2, length, 32);
        }
        // ★★★ Circle形状の寸法とジオメトリ作成成否をログ出力 ★★★
        console.log(
          `Column ${
            col.id
          }: Creating Circle geometry with D=${D}. Geometry created: ${!!geometry}`
        );
      }
      // 他のコンクリート形状の処理
      else {
        // ★★★ どのコンクリートタイプにも一致しなかった場合 ★★★
        console.log(
          // ★★★ 比較対象の文字列リストも修正 ★★★
          `Column ${col.id}: Concrete shape type ${concreteShape.type} did not match known types (StbSecColumn_RC_Rect, StbSecColumn_Circle).` // Circleも修正が必要なら追記
        );
      }
    } else {
      // ★★★ shapeName も concreteShapeData もない場合 ★★★
      console.log(
        `Column ${col.id}, Section ID ${col.id_section}: sectionData lacks both shapeName and concreteShapeData.`
      );
    }

    // デフォルトジオメトリ (もし上記で作成されなかった場合)
    if (!geometry) {
      // ★★★ デフォルトサイズもmm単位に ★★★
      const defaultSize = 300; // 300mm
      geometry = new THREE.BoxGeometry(defaultSize, defaultSize, length);
      console.warn(
        `Column ${col.id}: Using default geometry for section ${col.id_section}.`
      );
    }

    // メッシュ作成と配置
    const material = materials.matchedMesh; // 仮のマテリアル
    const mesh = new THREE.Mesh(geometry, material);

    // メッシュの位置と向きを調整
    mesh.position.copy(bottomNode).lerp(topNode, 0.5); // 線分の中点に配置
    if (geometry instanceof THREE.CylinderGeometry) {
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    } else {
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }

    // ユーザーデータを追加 (クリック時の情報表示用)
    mesh.userData = {
      elementType: "Column",
      elementId: col.id, // STBの要素ID
      modelSource: "A", // 仮 (比較機能実装時に更新)
      stbElementId: col.id, // 属性表示用
      // 必要に応じて他の情報も追加
    };

    meshes.push(mesh);
  }

  return meshes;
}

// ★★★ 重複している以下の関数定義を削除 ★★★
/*
 * 柱要素のメッシュを作成する
 * @param {Array} columns - 柱データの配列
 * @param {Object} sectionsData - 断面データのオブジェクト
 * @param {string} modelSource - モデルソース ('A' または 'B')
 * @param {string} viewMode - 表示モード ('solid' または 'wireframe')
 * @returns {THREE.Group} 柱メッシュを含むグループ
 */
/*
export function createColumnMeshes(
  columns,
  sectionsData,
  modelSource,
  viewMode
) {
  // ... (削除される関数の内容) ...
}
*/
// ★★★ 削除ここまで ★★★
