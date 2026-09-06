// Run from the repository root: swift scripts/export-owl-assets.swift
// Requires macOS. Resize the approved raster artwork without redrawing it.
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let masterPath = "assets/branding/whoo-called-owl-master.png"

func read(_ path: String) throws -> CGImage {
    let data = try Data(contentsOf: root.appendingPathComponent(path))
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fatalError("Cannot read \(path)")
    }
    return image
}

let master = try read(masterPath)
precondition(master.width == 1254 && master.height == 1254,
             "Expected the approved September 5, 2026 source artwork")
// Trim only the outer canvas, retaining the owl and its soft edge pixels.
// The untouched master remains the original, byte-for-byte supplied PNG.
let owl = master.cropping(to: CGRect(x: 76, y: 24, width: 1102, height: 1170))!
let night = CGColor(srgbRed: 18 / 255, green: 17 / 255, blue: 15 / 255, alpha: 1)
var count = 0

func export(_ path: String, width: Int, height: Int, box: CGRect,
            opaque: Bool = false, round: Bool = false) throws {
    let alpha: CGImageAlphaInfo = opaque ? .noneSkipLast : .premultipliedLast
    let context = CGContext(data: nil, width: width, height: height,
                            bitsPerComponent: 8, bytesPerRow: width * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: alpha.rawValue)!
    let canvas = CGRect(x: 0, y: 0, width: width, height: height)
    if round {
        context.addEllipse(in: canvas.insetBy(dx: 1, dy: 1))
        context.clip()
    }
    if opaque || round {
        context.setFillColor(night)
        context.fill(canvas)
    }
    let scale = min(box.width / CGFloat(owl.width), box.height / CGFloat(owl.height))
    let fittedWidth = CGFloat(owl.width) * scale
    let fittedHeight = CGFloat(owl.height) * scale
    // Input boxes use top-left coordinates; Core Graphics draws from bottom-left.
    let target = CGRect(x: box.midX - fittedWidth / 2,
                        y: CGFloat(height) - box.midY - fittedHeight / 2,
                        width: fittedWidth, height: fittedHeight)
    context.interpolationQuality = .high
    context.draw(owl, in: target)
    let image = context.makeImage()!
    let output = root.appendingPathComponent(path)
    let destination = CGImageDestinationCreateWithURL(output as CFURL,
                                                     UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination), "Cannot save \(path)")
    count += 1
}

// Keep the established visible height and placement of the shared in-app owl.
try export("assets/branding/whoo-called-owl-transparent-1024.png",
           width: 1024, height: 1024, box: CGRect(x: 148, y: 170, width: 732, height: 738))
try export("assets/branding/whoo-called-owl-transparent.png",
           width: 374, height: 386, box: CGRect(x: 54, y: 64, width: 267, height: 278))

// Opaque app-store/legacy icons retain safe margins on the Night background.
let iconBox = CGRect(x: 148, y: 143, width: 728, height: 738)
try export("assets/branding/whoo-called-app-icon-1024.png",
           width: 1024, height: 1024, box: iconBox, opaque: true)
for path in ["assets/branding/whoo-called-icon-liquid-source.png",
             "ios/WhooCalled/WhooCalled.icon/Assets/whoo-called-icon-liquid-source.png"] {
    try export(path, width: 1024, height: 1024,
               box: CGRect(x: 250, y: 242, width: 524, height: 540), opaque: true)
}

let appIcons = "ios/WhooCalled/Images.xcassets/AppIcon.appiconset"
for file in try FileManager.default.contentsOfDirectory(atPath: appIcons).sorted()
    where file.hasSuffix(".png") {
    let path = "\(appIcons)/\(file)"
    let existing = try read(path)
    let scale = CGFloat(existing.width) / 1024
    try export(path, width: existing.width, height: existing.height,
               box: CGRect(x: iconBox.minX * scale, y: iconBox.minY * scale,
                           width: iconBox.width * scale, height: iconBox.height * scale),
               opaque: true)
}

let launchMarks = "ios/WhooCalled/Images.xcassets/LaunchMark.imageset"
for file in try FileManager.default.contentsOfDirectory(atPath: launchMarks).sorted()
    where file.hasSuffix(".png") {
    let path = "\(launchMarks)/\(file)"
    let existing = try read(path)
    let xScale = CGFloat(existing.width) / 374
    let yScale = CGFloat(existing.height) / 386
    try export(path, width: existing.width, height: existing.height,
               box: CGRect(x: 54 * xScale, y: 64 * yScale,
                           width: 267 * xScale, height: 278 * yScale))
}

for density in ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"] {
    for name in ["ic_launcher", "ic_launcher_round"] {
        let path = "android/app/src/main/res/mipmap-\(density)/\(name).png"
        let existing = try read(path)
        let size = CGFloat(existing.width)
        let isRound = name.hasSuffix("_round")
        try export(path, width: existing.width, height: existing.height,
                   box: CGRect(x: size * 0.16, y: size * 0.14,
                               width: size * 0.68, height: size * 0.72),
                   opaque: !isRound, round: isRound)
    }
}
print("Exported \(count) owl assets from the approved master.")
