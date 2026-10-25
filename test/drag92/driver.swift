// drag92 driver: CGEvent mouse gestures + CGWindowList measurement.
// Usage: swift drag92-driver.swift <launcher-pid>
import CoreGraphics
import AppKit
import Foundation

let pid = Int32(CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "0") ?? 0

func win() -> CGRect? {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID)
          as? [[String: Any]] else { return nil }
  for w in list {
    guard (w[kCGWindowOwnerPID as String] as? Int32) == pid,
          (w[kCGWindowLayer as String] as? Int) == 0,
          let b = w[kCGWindowBounds as String] as? [String: Any],
          let x = b["X"] as? Double, let y = b["Y"] as? Double,
          let wd = b["Width"] as? Double else { continue }
    return CGRect(x: x, y: y, width: wd, height: b["Height"] as? Double ?? 300)
  }
  return nil
}

var deadlined = 0.0
while win() == nil && deadlined < 15 {
  Thread.sleep(forTimeInterval: 0.5); deadlined += 0.5
}
guard var b = win() else { print(#"{"error":"window not found"}"#); exit(1) }
Thread.sleep(forTimeInterval: 1.5)
b = win() ?? b

func post(_ t: CGEventType, _ x: Double, _ y: Double) {
  let ev = CGEvent(mouseEventSource: nil, mouseType: t,
                   mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)!
  ev.post(tap: .cghidEventTap)
}
func scroll() {
  let ev = CGEvent(scrollWheelEvent2Source: nil, units: .pixel,
                   wheelCount: 1, wheel1: 4, wheel2: 0, wheel3: 0)!
  ev.post(tap: .cghidEventTap)
}
func drag(_ x0: Double, _ y: Double, steps: Int, dx: Double) {
  post(.leftMouseDown, x0, y)
  Thread.sleep(forTimeInterval: 0.06)
  for i in 1...steps { post(.leftMouseDragged, x0 + Double(i) * dx, y + 2);
                       Thread.sleep(forTimeInterval: 0.03) }
  post(.leftMouseUp, x0 + Double(steps) * dx, y)
  Thread.sleep(forTimeInterval: 0.4)
}

var res = [String: Double]()

// A: plain data-tiny-drag strip (top)
drag(b.midX, b.minY + 24, steps: 5, dx: 40)
res["plain_dx"] = (win()?.minX ?? b.minX) - b.minX
let afterA = win() ?? b

// B: press, poison currentEvent with scrolls, page startDrag lands at +350ms.
// The 0.6 s wait keeps ~250 ms between the delayed startDrag and the first
// dragged event, so the dispatch is still inside the poisoned window even
// on a loaded machine (a dispatch landing after the first drag would let a
// PRE-fix launcher pass via currentEvent == LeftMouseDragged).
post(.leftMouseDown, afterA.midX, afterA.minY + 72)
for _ in 0..<25 { scroll(); Thread.sleep(forTimeInterval: 0.004) }
Thread.sleep(forTimeInterval: 0.6)
for i in 1...6 { post(.leftMouseDragged, afterA.midX + Double(i) * 40, afterA.minY + 74);
                 Thread.sleep(forTimeInterval: 0.03) }
post(.leftMouseUp, afterA.midX + 240, afterA.minY + 74)
Thread.sleep(forTimeInterval: 0.4)
res["poison_dx"] = (win()?.minX ?? afterA.minX) - afterA.minX
let afterB = win() ?? afterA

// C: startDrag with no button held — must no-op, not hang. y+130 is
// comfortably inside #nobtn (y 116-160); the page records the click in its
// store and run.sh asserts it, so this case cannot pass vacuously.
post(.leftMouseDown, afterB.minX + 180, afterB.minY + 130)
post(.leftMouseUp, afterB.minX + 180, afterB.minY + 130)
Thread.sleep(forTimeInterval: 0.8)
res["nobtn_dx"] = (win()?.minX ?? afterB.minX) - afterB.minX
let afterC = win() ?? afterB

// aliveness: a plain drag must still engage
drag(afterC.midX, afterC.minY + 24, steps: 4, dx: -30)
res["alive_dx"] = (win()?.minX ?? afterC.minX) - afterC.minX

let ks = res.keys.sorted()
print("{" + ks.map { "\"\($0)\": \(res[$0]!)" }.joined(separator: ", ") + "}")
