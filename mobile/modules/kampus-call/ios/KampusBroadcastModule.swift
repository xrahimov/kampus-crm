import ExpoModulesCore
import ReplayKit
import UIKit

/*
 * The app's side of sharing an iPhone's or iPad's screen (A-223). iOS captures
 * the screen in an extension, a process of its own; this module opens the
 * system's sheet that starts it, and tells JavaScript when the extension says
 * that sharing began or ended. The extension speaks with Darwin notifications:
 * they cross between processes and carry nothing but their name.
 */

private let startedName = "center.kampus.app.broadcast.started"
private let stoppedName = "center.kampus.app.broadcast.stopped"
/** The Info.plist key that names the extension (the WebRTC library reads the same one). */
private let extensionKey = "RTCScreenSharingExtension"

public final class KampusBroadcastModule: Module {
  private var listening = false
  private var picker: RPSystemBroadcastPickerView?

  public func definition() -> ModuleDefinition {
    Name("KampusBroadcast")

    Events("onBroadcast")

    OnStartObserving {
      self.listen()
    }

    OnStopObserving {
      self.unlisten()
    }

    OnDestroy {
      self.unlisten()
    }

    // Opens the system's "Screen Broadcast" sheet with Kampus chosen. False when it could not.
    AsyncFunction("showPicker") { () -> Bool in
      return self.showPicker()
    }
    .runOnQueue(.main)
  }

  /**
   * The system gives no call that opens its sheet, only a button that does.
   * The button is put in the window unseen and pressed for the person, who
   * has just pressed "Share screen" in the lesson.
   */
  private func showPicker() -> Bool {
    guard let name = Bundle.main.object(forInfoDictionaryKey: extensionKey) as? String,
      let window = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow })
    else { return false }

    let view = picker ?? RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
    picker = view
    view.preferredExtension = name
    view.showsMicrophoneButton = false
    view.alpha = 0
    view.isUserInteractionEnabled = false
    if view.superview !== window {
      window.addSubview(view)
    }
    for case let button as UIButton in view.subviews {
      button.sendActions(for: .touchUpInside)
      return true
    }
    return false
  }

  private func listen() {
    guard !listening else { return }
    listening = true
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let me = Unmanaged.passUnretained(self).toOpaque()
    for name in [startedName, stoppedName] {
      CFNotificationCenterAddObserver(
        center, me,
        { _, observer, name, _, _ in
          guard let observer = observer, let name = name else { return }
          let module = Unmanaged<KampusBroadcastModule>.fromOpaque(observer).takeUnretainedValue()
          module.heard(name.rawValue as String)
        },
        name as CFString, nil, .deliverImmediately)
    }
  }

  private func unlisten() {
    guard listening else { return }
    listening = false
    CFNotificationCenterRemoveEveryObserver(
      CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
  }

  private func heard(_ name: String) {
    sendEvent("onBroadcast", ["state": name == startedName ? "started" : "stopped"])
  }
}
