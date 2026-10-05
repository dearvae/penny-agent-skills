// On-screen text boxes for a list of images, via macOS Vision OCR (on-device, no network).
//
//   swiftc -O scripts/vision_text.swift -o ~/.cache/agent-cut/vision_text && ~/.cache/agent-cut/vision_text a.jpg b.jpg
//   → {"a.jpg": [{"t": "进门就是开放式厨房", "x": 0.21, "y": 0.78, "w": 0.58, "h": 0.035, "c": 0.98}], …}
//
// Coordinates are normalised with the origin top-left. Used by learn_style.py to find where a reference
// video puts its captions and titles, how big they are and how they change.

import Foundation
import Vision
import AppKit

var out: [String: [[String: Any]]] = [:]
for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        out[path] = []
        continue
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    req.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    out[path] = (req.results ?? []).compactMap { obs in
        guard let top = obs.topCandidates(1).first else { return nil }
        let r = obs.boundingBox
        return ["t": top.string, "x": Double(r.minX), "y": Double(1 - r.maxY), "w": Double(r.width),
                "h": Double(r.height), "c": Double(top.confidence)]
    }
}
let data = try JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(data)
