#!/usr/bin/env swift
// contact-lookup.swift — looks up a contact by name and outputs JSON.
// Usage:
//   swift contact-lookup.swift "Hannah Montana"           -> full address JSON
//   swift contact-lookup.swift "Hannah Montana" validate  -> count/label summary JSON
//
// Output shapes:
//   { "found": false }
//   { "found": false, "error": "access_denied" }
//   { "found": true, "name": "...", "addresses": [{ street, city, state, zip, country, label }] }
//   { "found": true, "addressCount": N, "preferredLabel": "home" }  (validate mode)

import Contacts
import Foundation

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: contact-lookup.swift <name> [validate]\n", stderr)
    exit(1)
}

let contactName  = CommandLine.arguments[1]
let validateMode = CommandLine.arguments.count > 2 && CommandLine.arguments[2] == "validate"

// ── Request Contacts access ────────────────────────────────────────────────────

let store = CNContactStore()
let sem   = DispatchSemaphore(value: 0)
var granted = false

store.requestAccess(for: .contacts) { ok, _ in
    granted = ok
    sem.signal()
}
sem.wait()

// ── Helpers ────────────────────────────────────────────────────────────────────

func writeJSON(_ obj: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let str  = String(data: data, encoding: .utf8) else { return }
    print(str)
}

guard granted else {
    writeJSON(["found": false, "error": "access_denied"] as [String: Any])
    exit(0)
}

// ── Contact lookup ─────────────────────────────────────────────────────────────

let keys: [CNKeyDescriptor] = [
    CNContactGivenNameKey    as CNKeyDescriptor,
    CNContactFamilyNameKey   as CNKeyDescriptor,
    CNContactPostalAddressesKey as CNKeyDescriptor,
]

let predicate = CNContact.predicateForContacts(matchingName: contactName)
let contacts  = (try? store.unifiedContacts(matching: predicate, keysToFetch: keys)) ?? []

guard !contacts.isEmpty else {
    writeJSON(["found": false] as [String: Any])
    exit(0)
}

let c = contacts[0]

var addresses: [[String: String]] = []
for lv in c.postalAddresses {
    let a        = lv.value
    let rawLabel = lv.label ?? ""
    let label    = CNLabeledValue<CNPostalAddress>
                     .localizedString(forLabel: rawLabel)
                     .lowercased()
    addresses.append([
        "street":  a.street,
        "city":    a.city,
        "state":   a.state,
        "zip":     a.postalCode,
        "country": a.isoCountryCode.isEmpty ? a.country : a.isoCountryCode,
        "label":   label,
    ])
}

// ── Output ─────────────────────────────────────────────────────────────────────

if validateMode {
    let preferred = addresses.first(where: { $0["label"] == "home" })
                 ?? addresses.first(where: { $0["label"] == "other" })
                 ?? addresses.first
    writeJSON([
        "found":          true,
        "addressCount":   addresses.count,
        "preferredLabel": preferred?["label"] ?? "",
    ] as [String: Any])
} else {
    let fullName = "\(c.givenName) \(c.familyName)"
                    .trimmingCharacters(in: .whitespaces)
    writeJSON([
        "found":     true,
        "name":      fullName,
        "addresses": addresses,
    ] as [String: Any])
}
