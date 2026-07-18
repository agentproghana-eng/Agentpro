import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:url_launcher/url_launcher.dart";
import "../../shared/theme/app_theme.dart";

class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  Future<void> _call(String number) async {
    final uri = Uri(scheme: "tel", path: number);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _email(String address) async {
    final uri = Uri(scheme: "mailto", path: address);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _whatsapp(String number) async {
    final uri = Uri.parse("https://wa.me/$number");
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Support")),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        InkWell(
          onTap: () => context.push("/ai"),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppTheme.primaryColor, Color(0xFF004D43)]),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(children: [
              const Icon(Icons.smart_toy_outlined, color: Colors.white, size: 26),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text("AI Assistant", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                Text("Ask about any feature, or get help with a transaction", style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 11.5)),
              ])),
              const Icon(Icons.chevron_right, color: Colors.white),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text("Call Your Network", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const Text("For PIN issues and account problems", style: TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 10),
            _CallRow(label: "MTN", number: "100", onTap: _call),
            const Divider(height: 20),
            _CallRow(label: "Telecel", number: "100", onTap: _call),
            const Divider(height: 20),
            _CallRow(label: "AirtelTigo", number: "100", onTap: _call),
          ]),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text("App Support", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const Text("For questions about Agent Pro Ghana itself", style: TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 10),
            InkWell(
              onTap: () => _email("support@agentproghana.com"),
              child: const Row(children: [
                Icon(Icons.mail_outline, size: 18, color: AppTheme.primaryColor),
                SizedBox(width: 8),
                Text("support@agentproghana.com", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ),
            const SizedBox(height: 10),
            InkWell(
              onTap: () => _call("0207438990"),
              child: const Row(children: [
                Icon(Icons.call_outlined, size: 18, color: AppTheme.primaryColor),
                SizedBox(width: 8),
                Text("0207438990", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ),
            const SizedBox(height: 10),
            InkWell(
              onTap: () => _whatsapp("233207438990"),
              child: const Row(children: [
                Icon(Icons.chat_outlined, size: 18, color: AppTheme.primaryColor),
                SizedBox(width: 8),
                Text("WhatsApp: 0207438990", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ),
            const SizedBox(height: 10),
            const Text("Mon - Fri, 8:00 AM - 5:00 PM", style: TextStyle(fontSize: 11, color: Colors.grey)),
          ]),
        ),
      ]),
    );
  }
}

class _CallRow extends StatelessWidget {
  final String label;
  final String number;
  final Future<void> Function(String) onTap;
  const _CallRow({required this.label, required this.number, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onTap(number),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        Row(children: [
          const Icon(Icons.call_outlined, size: 16, color: AppTheme.primaryColor),
          const SizedBox(width: 6),
          Text("Call $number", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.primaryColor)),
        ]),
      ]),
    );
  }
}
