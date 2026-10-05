// Face boxes for a list of images, via macOS Vision (on-device, no network).
//
//   swift scripts/vision_faces.swift frame1.jpg frame2.jpg …   → JSON on stdout
//   {"frame1.jpg": [{"x":0.31,"y":0.12,"w":0.22,"h":0.18,"c":0.98,"eyes":[…],"mouth":[…]}], …}
//
// Coordinates are normalised, origin top-left. eyes / mouth are [x, y, w, h] boxes of those landmarks
// when Vision finds them (used to judge whether an overlay covers the parts that matter).
// Each image also gets a "<path>#people" entry: whole-body boxes (small figures, mirror reflections).
// Called by qa_layout.py and index_broll.py; they fall back to OpenCV Haar when Swift is unavailable.

import Foundation
import Vision
import AppKit

func box(_ pts: [CGPoint], in face: CGRect) -> [Double]? {
    guard !pts.isEmpty else { return nil }
    let xs = pts.map { face.minX + $0.x * face.width }
    let ys = pts.map { face.minY + $0.y * face.height }
    let minX = xs.min()!, maxX = xs.max()!, minY = ys.min()!, maxY = ys.max()!
    // Vision origin is bottom-left; flip to top-left
    return [Double(minX), Double(1 - maxY), Double(maxX - minX), Double(maxY - minY)]
}

var out: [String: [[String: Any]]] = [:]
for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        out[path] = []
        continue
    }
    let req = VNDetectFaceLandmarksRequest()
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([req])
    var faces: [[String: Any]] = []
    for f in req.results ?? [] {
        let r = f.boundingBox
        var d: [String: Any] = ["x": Double(r.minX), "y": Double(1 - r.maxY), "w": Double(r.width),
                                "h": Double(r.height), "c": Double(f.confidence)]
        if let lm = f.landmarks {
            let eyes = (lm.leftEye?.normalizedPoints ?? []) + (lm.rightEye?.normalizedPoints ?? [])
            if let e = box(eyes, in: r) { d["eyes"] = e }
            if let m = box(lm.outerLips?.normalizedPoints ?? [], in: r) { d["mouth"] = m }
        }
        faces.append(d)
    }
    out[path] = faces
    // whole people (catches small figures and mirror reflections whose face is too small to detect)
    let body = VNDetectHumanRectanglesRequest()
    body.upperBodyOnly = false
    try? handler.perform([body])
    out[path + "#people"] = (body.results ?? []).filter { $0.confidence >= 0.5 }.map { o in
        let r = o.boundingBox
        return ["x": Double(r.minX), "y": Double(1 - r.maxY), "w": Double(r.width), "h": Double(r.height),
                "c": Double(o.confidence)] as [String: Any]
    }
}
let data = try JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(data)
