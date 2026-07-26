import UIKit
import Capacitor
import LocalAuthentication
import Security

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}

@objc(RadiantBridgeViewController)
class RadiantBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(RadiantBiometricsPlugin())
        bridge?.registerPluginInstance(RadiantNativeAuthStorePlugin())
    }
}

@objc(RadiantBiometricsPlugin)
public class RadiantBiometricsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RadiantBiometricsPlugin"
    public let jsName = "RadiantBiometrics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private func biometryLabel(_ type: LABiometryType) -> String {
        if type == .faceID {
            return "Face ID"
        }
        if type == .touchID {
            return "Touch ID"
        }
        if #available(iOS 17.0, *), type == .opticID {
            return "Optic ID"
        }
        return "Device passcode"
    }

    @objc func check(_ call: CAPPluginCall) {
        let context = LAContext()
        context.localizedFallbackTitle = "Use Passcode"
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        let biometryAvailable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        call.resolve([
            "available": available,
            "biometryAvailable": biometryAvailable,
            "deviceSecure": available,
            "biometryType": String(context.biometryType.rawValue),
            "label": biometryLabel(context.biometryType),
            "code": error?.domain ?? (available ? "available" : "unavailable"),
            "reason": error?.localizedDescription ?? "Device authentication is available."
        ])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Unlock Radiant Guard"
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        context.localizedFallbackTitle = "Use Passcode"

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.reject(error?.localizedDescription ?? "Face ID or device passcode is not available", "notAvailable")
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, authError in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["success": true])
                } else {
                    call.reject(authError?.localizedDescription ?? "Authentication failed", "authFailed")
                }
            }
        }
    }
}

@objc(RadiantNativeAuthStorePlugin)
public class RadiantNativeAuthStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RadiantNativeAuthStorePlugin"
    public let jsName = "RadiantNativeAuthStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPhone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPhone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPhone", returnType: CAPPluginReturnPromise)
    ]

    private let service = "app.lovable.radiantguard.biometric"
    private let account = "primary-phone"

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    @objc func getPhone(_ call: CAPPluginCall) {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data, let phone = String(data: data, encoding: .utf8), !phone.isEmpty else {
            call.resolve(["hasPhone": false])
            return
        }

        call.resolve(["hasPhone": true, "phone": phone])
    }

    @objc func setPhone(_ call: CAPPluginCall) {
        guard let phone = call.getString("phone"), !phone.isEmpty else {
            call.reject("Missing phone", "missingPhone")
            return
        }

        guard let data = phone.data(using: .utf8) else {
            call.reject("Phone could not be encoded", "encodeFailed")
            return
        }

        SecItemDelete(baseQuery() as CFDictionary)
        var attributes = baseQuery()
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve(["saved": true])
        } else {
            call.reject("Keychain save failed", "keychainSaveFailed", NSError(domain: NSOSStatusErrorDomain, code: Int(status)))
        }
    }

    @objc func clearPhone(_ call: CAPPluginCall) {
        SecItemDelete(baseQuery() as CFDictionary)
        call.resolve(["cleared": true])
    }
}
