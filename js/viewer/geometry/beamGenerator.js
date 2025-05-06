/**
 * @fileoverview 梁形状生成モジュール
 *
 * このファイルは、STBデータに基づいて梁の3D形状を生成します:
 * - 鉄骨梁の形状生成（H形鋼、溝形鋼、T形鋼など）
 * - RC梁の形状生成
 * - 断面情報に基づく正確な形状表現
 * - 大梁・小梁の形状生成
 * - メッシュの位置・回転の調整
 *
 * STBの断面データから適切な3D形状を生成し、
 * 建築モデルの梁要素を視覚的に表現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { materials } from "../rendering/materials.js";

/**
 * 梁要素データに基づいて梁のメッシュを作成する
 * @param {Array} beamElements - 大梁または小梁の要素配列
 * @param {Map<string, THREE.Vector3>} nodes - 節点データのマップ
 * @param {Map<string, Object>} beamSections - 梁断面データのマップ
 * @param {Map<string, Object>} steelSections - 鋼材形状データのマップ
 * @param {string} elementType - "Girder"または"Beam"
 * @returns {Array<THREE.Mesh>} 作成された梁メッシュの配列
 */
export function createBeamMeshes(
  beamElements, // Girder または Beam の要素配列
  nodes,
  beamSections, // Girder または Beam の断面データマップ
  steelSections,
  elementType // "Girder" または "Beam"
) {
  const meshes = [];
  for (const bm of beamElements) {
    const start = nodes.get(bm.id_node_start);
    const end = nodes.get(bm.id_node_end);
    const sectionData = beamSections.get(bm.id_section);
    if (!start || !end || !sectionData) {
      console.warn(
        `Skipping ${elementType} ${bm.id}: Missing node or section data.`
      );
      continue;
    }

    // １．長さ・方向を計算
    const length = start.distanceTo(end);
    // const dir = new THREE.Vector3().subVectors(end, start).normalize(); // lookAt を使うので dir は不要に

    // ２．鉄骨断面データ取得と形状生成
    let shape = null;
    // --- 鉄骨断面の処理 ---
    if (sectionData.shapeName && steelSections.has(sectionData.shapeName)) {
      const steelShape = steelSections.get(sectionData.shapeName);
      const shapeType = steelShape.shapeTypeAttr || steelShape.elementTag;

      // ★★★ デバッグログ追加 ★★★
      console.log(
        `Beam ${bm.id}: shapeName='${sectionData.shapeName}', shapeType='${shapeType}', steelShape data:`,
        steelShape
      );
      // ★★★ デバッグログ追加ここまで ★★★

      // --- H形鋼 ---
      if (shapeType.includes("H")) {
        const H = parseFloat(steelShape.A);
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.t1);
        const tf = parseFloat(steelShape.t2);
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
          shape = new THREE.Shape();
          const halfB = B / 2;
          const halfH = H / 2;
          const halfTw = tw / 2;
          const innerH_half = halfH - tf;

          // ★ columnGeneratorと同じ形状定義に修正（原点は断面中心）
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
          `${elementType} ${
            bm.id
          }: Trying H-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // --- 角形鋼管 (BOX) ---
      else if (shapeType.includes("BOX")) {
        const H = parseFloat(steelShape.A);
        const B = parseFloat(steelShape.B);
        const t = parseFloat(steelShape.t);
        const t1 = parseFloat(steelShape.t1);
        const t2 = parseFloat(steelShape.t2);
        const isBuildBox = shapeType.includes("Build-BOX");

        if (!isNaN(H) && !isNaN(B) && H > 0 && B > 0) {
          shape = new THREE.Shape();
          const H_half = H / 2;
          const W_half = B / 2;
          // ★★★ 断面原点を中央上部に変更 (Y座標を -H_half) ★★★
          const topY = 0; // H_half - H_half
          const bottomY = -H; // -H_half - H_half

          shape.moveTo(-W_half, topY);
          shape.lineTo(W_half, topY);
          shape.lineTo(W_half, bottomY);
          shape.lineTo(-W_half, bottomY);
          shape.closePath();

          let innerTopY, innerBottomY, innerLeftX, innerRightX;
          if (
            isBuildBox &&
            !isNaN(t1) &&
            !isNaN(t2) &&
            t1 > 0 &&
            t2 > 0 &&
            t1 < B &&
            2 * t2 < H
          ) {
            innerTopY = topY - t2;
            innerBottomY = bottomY + t2;
            innerLeftX = -W_half + t1;
            innerRightX = W_half - t1;
          } else if (
            !isBuildBox &&
            !isNaN(t) &&
            t > 0 &&
            2 * t < H &&
            2 * t < B
          ) {
            innerTopY = topY - t;
            innerBottomY = bottomY + t;
            innerLeftX = -W_half + t;
            innerRightX = W_half + t;
          } else {
            innerTopY = 1;
            innerBottomY = 0; // 無効な値で穴が開かないように
          }

          if (innerTopY > innerBottomY && innerRightX > innerLeftX) {
            // Check validity
            const hole = new THREE.Path();
            hole.moveTo(innerLeftX, innerTopY);
            hole.lineTo(innerRightX, innerTopY);
            hole.lineTo(innerRightX, innerBottomY);
            hole.lineTo(innerLeftX, innerBottomY);
            hole.closePath();
            shape.holes.push(hole);
          }
        }
        console.log(
          `${elementType} ${
            bm.id
          }: Trying Box-Shape. H=${H}, B=${B}, t/t1/t2=${t}/${t1}/${t2}. Shape created: ${!!shape}`
        );
      }
      // --- 円形鋼管 (Pipe) ---
      else if (shapeType.includes("Pipe")) {
        const D = parseFloat(steelShape.D);
        const t = parseFloat(steelShape.t);
        if (!isNaN(D) && !isNaN(t) && D > 0 && t > 0 && 2 * t < D) {
          shape = new THREE.Shape();
          const radius = D / 2;
          const innerRadius = radius - t;
          // ★★★ 断面原点を中央上部に変更 (中心を (0, -radius) に) ★★★
          const centerY = -radius;
          shape.absarc(0, centerY, radius, 0, Math.PI * 2, false);
          if (innerRadius > 1e-6) {
            const hole = new THREE.Path();
            hole.absarc(0, centerY, innerRadius, 0, Math.PI * 2, true);
            shape.holes.push(hole);
          }
        }
        console.log(
          `${elementType} ${
            bm.id
          }: Trying Pipe-Shape. D=${D}, t=${t}. Shape created: ${!!shape}`
        );
      }
      // --- 山形鋼 (L) ---
      else if (shapeType.includes("L")) {
        const H = parseFloat(steelShape.H || steelShape.A);
        const B = parseFloat(steelShape.B);
        const tw = parseFloat(steelShape.tw || steelShape.t1); // 縦フランジ厚
        const tf = parseFloat(steelShape.tf || steelShape.t2); // 横フランジ厚
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
          shape = new THREE.Shape();
          // ★★★ 断面原点を中央上部に変更 (Xを-B/2, Yを-H) ★★★
          const originX = -B / 2;
          const originY = -H;
          shape.moveTo(originX, originY); // 左下 (0,0 -> -B/2, -H)
          shape.lineTo(originX + B, originY); // 右下 (B,0 -> B/2, -H)
          shape.lineTo(originX + B, originY + tf); // 右フランジ上 (B,tf -> B/2, -H+tf)
          shape.lineTo(originX + tw, originY + tf); // ウェブ右フランジ上 (tw,tf -> -B/2+tw, -H+tf)
          shape.lineTo(originX + tw, originY + H); // ウェブ右上 (tw, H -> -B/2+tw, 0)
          shape.lineTo(originX, originY + H); // 左上 (0, H -> -B/2, 0)
          shape.closePath();
        }
        console.log(
          `${elementType} ${
            bm.id
          }: Trying L-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // --- T形鋼 (T) ---
      else if (shapeType.includes("T")) {
        const H = parseFloat(steelShape.H || steelShape.A);
        const B = parseFloat(steelShape.B); // フランジ幅
        const tw = parseFloat(steelShape.tw || steelShape.t1); // ウェブ厚
        const tf = parseFloat(steelShape.tf || steelShape.t2); // フランジ厚
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
          shape = new THREE.Shape();
          const halfB = B / 2;
          const halfTw = tw / 2;
          // ★★★ 断面原点を中央上部に変更 (Yを-H) ★★★
          const topY = 0; // H - H
          const bottomY = -H; // 0 - H
          const flangeBottomY = topY - tf; // (H - tf) - H

          shape.moveTo(-halfB, topY); // フランジ左上
          shape.lineTo(halfB, topY); // フランジ右上
          shape.lineTo(halfB, flangeBottomY); // フランジ右下
          shape.lineTo(halfTw, flangeBottomY); // ウェブ右上
          shape.lineTo(halfTw, bottomY); // ウェブ右下
          shape.lineTo(-halfTw, bottomY); // ウェブ左下
          shape.lineTo(-halfTw, flangeBottomY); // ウェブ左上
          shape.lineTo(-halfB, flangeBottomY); // フランジ左下
          shape.closePath();
        }
        console.log(
          `${elementType} ${
            bm.id
          }: Trying T-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // --- 溝形鋼 (C) ---
      else if (shapeType.includes("C")) {
        const H = parseFloat(steelShape.H || steelShape.A);
        const B = parseFloat(steelShape.B); // フランジ幅
        const tw = parseFloat(steelShape.tw || steelShape.t1); // ウェブ厚
        const tf = parseFloat(steelShape.tf || steelShape.t2); // フランジ厚
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
          shape = new THREE.Shape();
          // ★★★ 断面原点を中央上部に変更 (Xを-B/2, Yを-H) ★★★
          const originX = -B / 2;
          const originY = -H;

          shape.moveTo(originX, originY + H); // 左上 (0,H -> -B/2, 0)
          shape.lineTo(originX + B, originY + H); // 右上 (B,H -> B/2, 0)
          shape.lineTo(originX + B, originY + H - tf); // 右フランジ下 (B, H-tf -> B/2, -tf)
          shape.lineTo(originX + tw, originY + H - tf); // ウェブ右フランジ下 (tw, H-tf -> -B/2+tw, -tf)
          shape.lineTo(originX + tw, originY + tf); // ウェブ右フランジ上 (tw, tf -> -B/2+tw, -H+tf)
          shape.lineTo(originX + B, originY + tf); // 右フランジ上 (B, tf -> B/2, -H+tf)
          shape.lineTo(originX + B, originY); // 右下 (B, 0 -> B/2, -H)
          shape.lineTo(originX, originY); // 左下 (0, 0 -> -B/2, -H)
          shape.closePath();
        }
        console.log(
          `${elementType} ${
            bm.id
          }: Trying C-Shape. H=${H}, B=${B}, tw=${tw}, tf=${tf}. Shape created: ${!!shape}`
        );
      }
      // --- 他の鋼材形状 ---
      else {
        console.log(
          `${elementType} ${bm.id}: Steel shape ${sectionData.shapeName} (Type: ${shapeType}) did not match known types (H, BOX, Pipe, L, T, C).`
        );
      }
    }
    // --- RC断面の処理 ---
    else if (
      sectionData.sectionType === "StbSecBeam_RC" &&
      sectionData.concreteShapeData &&
      sectionData.concreteShapeData.type === "StbSecBeam_RC_Straight"
    ) {
      const width = parseFloat(sectionData.concreteShapeData.width);
      const height = parseFloat(sectionData.concreteShapeData.depth);
      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
        shape = new THREE.Shape();
        const halfW = width / 2;
        const halfH = height / 2;
        // ★★★ 断面原点を中央上部に変更 (Y座標を -halfH) ★★★
        const topY = 0; // halfH - halfH
        const bottomY = -height; // -halfH - halfH
        shape.moveTo(-halfW, topY);
        shape.lineTo(halfW, topY);
        shape.lineTo(halfW, bottomY);
        shape.lineTo(-halfW, bottomY);
        shape.closePath();
        console.log(
          `${elementType} ${bm.id}: RC矩形断面生成 width=${width}, depth=${height}`
        );
      } else {
        console.warn(
          `${elementType} ${bm.id}: RC断面寸法が不正 width=${width}, depth=${height}`
        );
      }
    }
    // --- SRC断面などの他のケースや、データ不足の場合 ---
    else {
      console.log(
        `${elementType} ${bm.id}, Section ID ${bm.id_section}: Unsupported section type or missing data. sectionData:`,
        sectionData
      );
    }

    // ３．ExtrudeGeometry 作成
    let geometry;
    if (shape) {
      geometry = new THREE.ExtrudeGeometry(shape, {
        depth: length,
        bevelEnabled: false,
        steps: 1,
      });
      // ★★★ 押し出し方向の中心が原点に来るようにジオメトリを移動 ★★★
      // この処理は形状の原点に関わらず、押し出し方向の中心合わせとして有効
      geometry.translate(0, 0, -length / 2);
    } else {
      // デフォルト断面（例：正方形）
      const defaultSize = 300; // mm
      // ★★★ デフォルト形状も中央上部を原点とするように調整 ★★★
      geometry = new THREE.BoxGeometry(defaultSize, defaultSize, length);
      // BoxGeometryは中心が原点なので、Y方向に -defaultSize/2、Z方向に -length/2 移動
      geometry.translate(0, -defaultSize / 2, -length / 2);
      console.warn(
        `${elementType} ${bm.id}: Using default geometry for section ${bm.id_section}.`
      );
    }

    // ４．メッシュ生成＆配置
    const mesh = new THREE.Mesh(geometry, materials.matchedMesh);

    // ★★★ 配置と回転方法 (梁は上端中心基準) ★★★
    mesh.up.set(0, 0, 1);
    mesh.position.copy(start);
    mesh.lookAt(end);
    mesh.position.copy(start).lerp(end, 0.5);

    // --- 梁の場合は断面の中心→上端中心へY方向に+H/2ずらす ---
    if (
      shape &&
      (elementType === "Beam" || elementType === "Girder") &&
      sectionData.shapeName &&
      steelSections.has(sectionData.shapeName)
    ) {
      const steelShape = steelSections.get(sectionData.shapeName);
      let H = parseFloat(steelShape.A);
      if (!isNaN(H) && H > 0) {
        // ローカルY軸がグローバルZ軸に一致するので、Z方向に+H/2移動
        mesh.position.z -= H / 2;
      }
    }

    mesh.userData = {
      elementType: elementType,
      elementId: bm.id,
      modelSource: "A",
      stbElementId: bm.id,
    };
    meshes.push(mesh);
  }
  return meshes;
}
