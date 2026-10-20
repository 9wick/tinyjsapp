// A fake second monitor for testing multi-screen code on a one-screen Mac,
// via CoreGraphics' private CGVirtualDisplay (what BetterDisplay uses). It
// lives as long as this process: kill it and the display is unplugged.
//
//   clang -fobjc-arc -framework Foundation -framework CoreGraphics \
//     test/screens/vdisplay.m -o /tmp/vdisplay
//   /tmp/vdisplay 1920 1080 0 &     # width height hidpi(0|1); prints its id
//   kill %1                          # unplug
//
// Private API — fine for a test rig, never for shipping code.
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
@interface CGVirtualDisplayDescriptor : NSObject
@property(retain) dispatch_queue_t queue; @property(retain) NSString *name;
@property unsigned int maxPixelsWide, maxPixelsHigh; @property CGSize sizeInMillimeters;
@property unsigned int productID, vendorID, serialNum;
@end
@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(unsigned)w height:(unsigned)h refreshRate:(double)r;
@end
@interface CGVirtualDisplaySettings : NSObject
@property(retain) NSArray *modes; @property unsigned int hiDPI;
@end
@interface CGVirtualDisplay : NSObject
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)d;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)s;
@property(readonly) unsigned int displayID;
@end
int main(int argc, char **argv) {
  @autoreleasepool {
    unsigned w = argc > 1 ? atoi(argv[1]) : 1920, h = argc > 2 ? atoi(argv[2]) : 1080;
    unsigned hidpi = argc > 3 ? atoi(argv[3]) : 0;
    CGVirtualDisplayDescriptor *d = [CGVirtualDisplayDescriptor new];
    d.queue = dispatch_get_main_queue(); d.name = @"tinyjs test display";
    d.maxPixelsWide = w * (hidpi ? 2 : 1); d.maxPixelsHigh = h * (hidpi ? 2 : 1);
    d.sizeInMillimeters = CGSizeMake(600, 340); d.productID = 0x7470; d.vendorID = 0x7470; d.serialNum = 1;
    CGVirtualDisplay *v = [[CGVirtualDisplay alloc] initWithDescriptor:d];
    CGVirtualDisplaySettings *s = [CGVirtualDisplaySettings new];
    s.hiDPI = hidpi;
    s.modes = @[[[CGVirtualDisplayMode alloc] initWithWidth:w height:h refreshRate:60]];
    if (![v applySettings:s]) { fprintf(stderr, "applySettings failed\n"); return 1; }
    printf("display %u\n", v.displayID); fflush(stdout);
    dispatch_main();
  }
}
