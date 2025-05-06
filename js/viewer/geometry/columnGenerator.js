/**
 * @fileoverview 柱形状生成モジュール
 *
 * このファイルは、STBデータに基づいて柱の3D形状を生成します:
 * - 鉄骨柱の形状生成（H形鋼、角形鋼管、円形鋼管など）
 * - RC柱の形状生成（矩形、円形）
 * - SRC柱の形状生成
 * - 断面情報に基づく正確な形状表現
 * - メッシュの位置・回転の調整
 *
 * STBの断面データから適切な3D形状を生成し、
 * 建築モデルの柱要素を視覚的に表現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "../rendering/materials.js";

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
    let shape = null; // ★ THREE.Shape オブジェクトを保持する変数
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

      const shapeType = steelShape.shapeTypeAttr || steelShape.elementTag; // 形状タイプを特定

      // H形鋼
      if (shapeType.includes("H")) {
        const H = parseFloat(steelShape.A); // A or H
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.t1); // tw or t1
        const tf = parseFloat(steelShape.t2); // tf or t2

        if (
          !isNaN(H) &&
          !isNaN(B) &&
          !isNaN(tw) &&
          !isNaN(tf) &&
          H > 0 &&
          B > 0 &&
          tw > 0 &&
          tf > 0 &&
          tw < B &&
          2 * tf < H
        ) {
          shape = new THREE.Shape(); // ★ shape 変数に代入
          const halfB = B / 2;
          const halfH = H / 2;
          const halfTw = tw / 2;
          const innerH_half = halfH - tf;

          shape.moveTo(-halfB, halfH);
          shape.lineTo(halfB, halfH);
          shape.lineTo(halfB, innerH_half);
          shape.lineTo(halfTw, innerH_half);
          shape.lineTo(halfTw, -innerH_half);
          shape.lineTo(halfB, -innerH_half);
          shape.lineTo(halfB, -halfH);
          shape.lineTo(-halfB, -halfH);
          shape.lineTo(-halfB, -innerH_half);
          shape.lineTo(-halfTw, -innerH_half);
          shape.lineTo(-halfTw, innerH_half);
          shape.lineTo(-halfB, innerH_half);
          shape.closePath();
        }
        console.log(
          `Column ${
            col.id
          }: Trying H-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // 角形鋼管 (BOX) - ★ THREE.Shape を使うように修正
      else if (shapeType.includes("BOX")) {
        const H = parseFloat(steelShape.A); // Height
        const B = parseFloat(steelShape.B); // Width
        const t = parseFloat(steelShape.t); // Thickness (Roll-BOX)
        const t1 = parseFloat(steelShape.t1); // Web thickness (Build-BOX)
        const t2 = parseFloat(steelShape.t2); // Flange thickness (Build-BOX)
        const isBuildBox = shapeType.includes("Build-BOX");

        if (!isNaN(H) && !isNaN(B) && H > 0 && B > 0) {
          shape = new THREE.Shape(); // ★ shape 変数に代入
          const H_half = H / 2;
          const W_half = B / 2;
          shape.moveTo(-W_half, H_half);
          shape.lineTo(W_half, H_half);
          shape.lineTo(W_half, -H_half);
          shape.lineTo(-W_half, -H_half);
          shape.closePath();

          let innerH_half, innerW_half;
          if (
            isBuildBox &&
            !isNaN(t1) &&
            !isNaN(t2) &&
            t1 > 0 &&
            t2 > 0 &&
            t1 < B &&
            2 * t2 < H
          ) {
            innerH_half = H_half - t2;
            innerW_half = W_half - t1;
          } else if (
            !isBuildBox &&
            !isNaN(t) &&
            t > 0 &&
            2 * t < H &&
            2 * t < B
          ) {
            innerH_half = H_half - t;
            innerW_half = W_half - t;
          } else {
            innerH_half = -1; // 無効な厚み
            innerW_half = -1;
            console.warn(
              `Column ${col.id}: Invalid thickness for Box-Shape, creating solid shape. Params:`,
              steelShape
            );
          }

          if (innerH_half > 0 && innerW_half > 0) {
            const hole = new THREE.Path();
            hole.moveTo(-innerW_half, innerH_half);
            hole.lineTo(innerW_half, innerH_half);
            hole.lineTo(innerW_half, -innerH_half);
            hole.lineTo(-innerW_half, -innerH_half);
            hole.closePath();
            shape.holes.push(hole);
          }
        }
        console.log(
          `Column ${
            col.id
          }: Trying Box-Shape. H=${H}, B=${B}, t/t1/t2=${t}/${t1}/${t2}. Shape created: ${!!shape}`
        );
      }
      // 円形鋼管 (Pipe) - ★ 追加
      else if (shapeType.includes("Pipe")) {
        const D = parseFloat(steelShape.D);
        const t = parseFloat(steelShape.t);
        if (!isNaN(D) && !isNaN(t) && D > 0 && t > 0 && 2 * t < D) {
          shape = new THREE.Shape(); // ★ shape 変数に代入
          const radius = D / 2;
          const innerRadius = radius - t;
          shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
          if (innerRadius > 1e-6) {
            // Consider floating point errors
            const hole = new THREE.Path();
            hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
            shape.holes.push(hole);
          }
        }
        console.log(
          `Column ${
            col.id
          }: Trying Pipe-Shape. D=${D}, t=${t}. Shape created: ${!!shape}`
        );
      }
      // 山形鋼 (L) - ★ 追加
      else if (shapeType.includes("L")) {
        const H = parseFloat(steelShape.H || steelShape.A); // A or H
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.tw || steelShape.t1); // tw or t1
        const tf = parseFloat(steelShape.tf || steelShape.t2); // tf or t2
        // Note: STB uses H, B, t1, t2 for L-shape
        if (
          !isNaN(H) &&
          !isNaN(B) &&
          !isNaN(tw) &&
          !isNaN(tf) &&
          H > 0 &&
          B > 0 &&
          tw > 0 &&
          tf > 0 &&
          tw < B &&
          tf < H
        ) {
          shape = new THREE.Shape(); // ★ shape 変数に代入
          // Assuming origin at the inner corner for simplicity
          shape.moveTo(0, 0);
          shape.lineTo(B, 0);
          shape.lineTo(B, tf);
          shape.lineTo(tw, tf);
          shape.lineTo(tw, H);
          shape.lineTo(0, H);
          shape.closePath();
          // Adjust position if needed (e.g., center the shape)
          // shape.translate(-B/2, -H/2); // Example centering
        }
        console.log(
          `Column ${
            col.id
          }: Trying L-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // T形鋼 (T) - ★ 追加
      else if (shapeType.includes("T")) {
        const H = parseFloat(steelShape.H || steelShape.A); // A or H
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.tw || steelShape.t1); // tw or t1
        const tf = parseFloat(steelShape.tf || steelShape.t2); // tf or t2
        if (
          !isNaN(H) &&
          !isNaN(B) &&
          !isNaN(tw) &&
          !isNaN(tf) &&
          H > 0 &&
          B > 0 &&
          tw > 0 &&
          tf > 0 &&
          tw < B &&
          tf < H
        ) {
          shape = new THREE.Shape(); // ★ shape 変数に代入
          const halfB = B / 2;
          const halfTw = tw / 2;
          const H_flangeTop = H - tf; // Y-coordinate of flange top

          shape.moveTo(-halfB, H); // Top-left flange
          shape.lineTo(halfB, H); // Top-right flange
          shape.lineTo(halfB, H_flangeTop); // Bottom-right flange
          shape.lineTo(halfTw, H_flangeTop); // Top-right web
          shape.lineTo(halfTw, 0); // Bottom-right web
          shape.lineTo(-halfTw, 0); // Bottom-left web
          shape.lineTo(-halfTw, H_flangeTop); // Top-left web
          shape.lineTo(-halfB, H_flangeTop); // Bottom-left flange
          shape.closePath();
          // Adjust position if needed (e.g., move origin to centroid)
          // shape.translate(0, -H/2); // Example centering vertically
        }
        console.log(
          `Column ${
            col.id
          }: Trying T-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // 溝形鋼 (C) - ★ 追加
      else if (shapeType.includes("C")) {
        const H = parseFloat(steelShape.H || steelShape.A); // A or H
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.tw || steelShape.t1); // tw or t1
        const tf = parseFloat(steelShape.tf || steelShape.t2); // tf or t2
        if (
          !isNaN(H) &&
          !isNaN(B) &&
          !isNaN(tw) &&
          !isNaN(tf) &&
          H > 0 &&
          B > 0 &&
          tw > 0 &&
          tf > 0 &&
          tw < B &&
          2 * tf < H
        ) {
          shape = new THREE.Shape(); // ★ shape 変数に代入
          const H_inner = H - 2 * tf;
          const B_web = B - tw; // X-coordinate of web's outer face

          shape.moveTo(0, H); // Top-left outer
          shape.lineTo(B, H); // Top-right outer
          shape.lineTo(B, H - tf); // Top-right inner
          shape.lineTo(tw, H - tf); // Top-left inner web
          shape.lineTo(tw, tf); // Bottom-left inner web
          shape.lineTo(B, tf); // Bottom-right inner
          shape.lineTo(B, 0); // Bottom-right outer
          shape.lineTo(0, 0); // Bottom-left outer
          shape.closePath();
          // Adjust position if needed
          // shape.translate(-B/2, -H/2); // Example centering
        }
        console.log(
          `Column ${
            col.id
          }: Trying C-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // 他の鋼材形状 (必要に応じて追加)
      // ...
      else {
        console.log(
          `Column ${col.id}: Steel shape ${sectionData.shapeName} (Type: ${shapeType}) did not match known types (H, BOX, Pipe, L, T, C).` // ★ 更新
        );
      }

      // ★ THREE.Shape が生成された場合のみ ExtrudeGeometry を作成
      if (shape) {
        const extrudeSettings = {
          steps: 1,
          depth: length,
          bevelEnabled: false,
        };
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
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
      } else if (
        concreteShape.type === "StbSecColumn_Circle" ||
        concreteShape.type === "StbSecColumn_RC_Circle" // ← RC円柱のタイプを追加
      ) {
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
          `Column ${col.id}: Concrete shape type ${concreteShape.type} did not match known types (StbSecColumn_RC_Rect, StbSecColumn_Circle, StbSecColumn_RC_Circle).` // Circleも修正が必要なら追記
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
    if (
      geometry instanceof THREE.CylinderGeometry ||
      geometry instanceof THREE.BoxGeometry
    ) {
      // RC柱など: 中心を原点に持つジオメトリ
      mesh.position.copy(bottomNode).lerp(topNode, 0.5); // 線分の中点に配置
      if (geometry instanceof THREE.CylinderGeometry) {
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction
        );
      } else {
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          direction
        );
      }
    } else if (geometry instanceof THREE.ExtrudeGeometry) {
      // S造柱(ExtrudeGeometry): 原点が底面
      mesh.position.copy(bottomNode);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    } else {
      // その他: 中点配置
      mesh.position.copy(bottomNode).lerp(topNode, 0.5);
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
