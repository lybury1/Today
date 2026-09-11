import UIKit
import Capacitor

// Registers app-local Capacitor plugins (Capacitor no longer auto-discovers them).
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(AlarmBridgePlugin())
    }
}
