import sys, objc
import Vision, Quartz
from Foundation import NSURL

inp, outp = sys.argv[1], sys.argv[2]
ci = Quartz.CIImage.imageWithContentsOfURL_(NSURL.fileURLWithPath_(inp))
req = Vision.VNGenerateForegroundInstanceMaskRequest.alloc().init()
handler = Vision.VNImageRequestHandler.alloc().initWithCIImage_options_(ci, None)
ok, err = handler.performRequests_error_([req], None)
res = req.results()[0]
mask_pb, err = res.generateScaledMaskForImageForInstances_fromRequestHandler_error_(res.allInstances(), handler, None)
mask = Quartz.CIImage.imageWithCVPixelBuffer_(mask_pb)
f = Quartz.CIFilter.filterWithName_("CIBlendWithMask")
f.setValue_forKey_(ci, "inputImage")
f.setValue_forKey_(Quartz.CIImage.imageWithColor_(Quartz.CIColor.clearColor()).imageByCroppingToRect_(ci.extent()), "inputBackgroundImage")
f.setValue_forKey_(mask, "inputMaskImage")
out = f.valueForKey_("outputImage")
ctx = Quartz.CIContext.context()
opts = {Quartz.kCIImageRepresentationAlphaMode if hasattr(Quartz,'kCIImageRepresentationAlphaMode') else 'alphaMode': 1}
url = NSURL.fileURLWithPath_(outp)
cs = Quartz.CGColorSpaceCreateWithName(Quartz.kCGColorSpaceSRGB)
ok = ctx.writePNGRepresentationOfImage_toURL_format_colorSpace_options_error_(out, url, Quartz.kCIFormatRGBA8, cs, None, None)
print("saved", ok)
