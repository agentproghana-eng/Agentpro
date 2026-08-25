import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/auth/personal_phone_verification_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

enum _CapabilityStep {
  identity,
  verification,
}

class AddPersonalCapabilityScreen extends StatefulWidget {
  const AddPersonalCapabilityScreen({
    super.key,
  });

  @override
  State<AddPersonalCapabilityScreen> createState() =>
      _AddPersonalCapabilityScreenState();
}

class _AddPersonalCapabilityScreenState
    extends State<AddPersonalCapabilityScreen> {
  final _otpController = TextEditingController();

  final _verificationClient = PersonalPhoneVerificationClient();

  List<SimCard> _supportedSims = const [];

  SimCard? _selectedSim;
  SimCard? _verificationSim;

  String? _installationId;
  String? _verificationInstallationId;
  String? _verificationPhone;
  String? _challengeToken;

  String? _identityWarning;

  _CapabilityStep _step = _CapabilityStep.identity;

  bool _loadingIdentity = true;
  bool _busy = false;

  int _resendSeconds = 0;

  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();

    _loadIdentity();
  }

  Map<String, dynamic> _currentUser() {
    final state = context.read<AuthBloc>().state;

    if ((state is AuthAuthenticated) == false) {
      return <String, dynamic>{};
    }

    return Map<String, dynamic>.from(
      (state as AuthAuthenticated).user,
    );
  }

  String _accountPhone() {
    return _currentUser()['phone']?.toString().trim() ?? '';
  }

  Future<void> _loadIdentity() async {
    String? installationId;
    String? warning;

    List<SimCard> supported = const [];

    try {
      installationId = await StorageService.getOrCreateInstallationId();
    } catch (_) {
      warning = 'AgentPro could not prepare the device identity.';
    }

    try {
      final sims = await SimCardService.getSimCards();

      supported = sims
          .where(
            (sim) => sim.isMoMoSupported,
          )
          .toList()
        ..sort(
          (left, right) => left.slot.compareTo(
            right.slot,
          ),
        );
    } on SimPermissionException {
      warning = 'Phone permission was not granted. '
          'Phone verification can continue, '
          'but physical SIM protection is unavailable.';
    } catch (_) {
      warning = 'AgentPro could not read SIM information. '
          'Phone verification can continue.';
    }

    if (mounted == false) {
      return;
    }

    setState(() {
      _installationId = installationId;

      _supportedSims = supported;

      if (supported.length == 1) {
        _selectedSim = supported.first;
      }

      _identityWarning = warning;

      _loadingIdentity = false;
    });
  }

  String? _simIccid(
    SimCard? sim,
  ) {
    final value = sim?.iccid.trim() ?? '';

    return value.isEmpty ? null : value;
  }

  String _providerLabel(
    String provider,
  ) {
    switch (provider) {
      case 'mtn':
        return 'MTN';

      case 'telecel':
        return 'Telecel';

      case 'at_money':
        return 'AT Money';

      default:
        return 'Mobile network';
    }
  }

  String _simLabel(
    SimCard sim,
  ) {
    return '${_providerLabel(sim.network)} • '
        'SIM ${sim.slot + 1}';
  }

  String _maskedPhone(
    String phone,
  ) {
    if (phone.length <= 4) {
      return phone;
    }

    final hidden = List<String>.filled(
      phone.length - 4,
      '•',
    ).join();

    return '$hidden'
        '${phone.substring(phone.length - 4)}';
  }

  void _showError(
    String message,
  ) {
    if (mounted == false) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
  }

  String _dioMessage(
    DioException error,
    String fallback,
  ) {
    final raw = error.response?.data;

    if (raw is Map) {
      final message = raw['message'];

      if (message is String && message.trim().isEmpty == false) {
        return message.trim();
      }
    }

    return fallback;
  }

  Future<void> _requestCode() async {
    if (_busy || _loadingIdentity) {
      return;
    }

    final phone = _accountPhone();

    if (phone.isEmpty) {
      _showError(
        'Your AgentPro account does not have a phone number. '
        'Update the account phone before enabling Personal Mode.',
      );
      return;
    }

    final installationId = _installationId;

    if (installationId == null || installationId.trim().isEmpty) {
      _showError(
        'AgentPro could not prepare this device identity. '
        'Reload this screen and try again.',
      );
      return;
    }

    if (_supportedSims.length > 1 && _selectedSim == null) {
      _showError(
        'Choose the SIM you will use as your Subscriber SIM.',
      );
      return;
    }

    final sim = _selectedSim;

    setState(() {
      _busy = true;
    });

    try {
      final result = await _verificationClient.start(
        phone: phone,
        installationId: installationId,
        simIccid: _simIccid(sim),
      );

      if (mounted == false) {
        return;
      }

      _otpController.clear();

      setState(() {
        _challengeToken = result.challengeToken;

        _verificationPhone = phone;

        _verificationInstallationId = installationId;

        _verificationSim = sim;

        _step = _CapabilityStep.verification;

        _busy = false;
      });

      _startResendCountdown();
    } on DioException catch (error) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _busy = false;
      });

      _showError(
        _dioMessage(
          error,
          'AgentPro could not send the verification code.',
        ),
      );
    } on FormatException {
      if (mounted == false) {
        return;
      }

      setState(() {
        _busy = false;
      });

      _showError(
        'AgentPro received an invalid verification response.',
      );
    } catch (_) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _busy = false;
      });

      _showError(
        'AgentPro could not send the verification code.',
      );
    }
  }

  Future<void> _resendCode() async {
    if (_busy || _resendSeconds > 0) {
      return;
    }

    final phone = _verificationPhone;

    final installationId = _verificationInstallationId;

    if (phone == null ||
        phone.isEmpty ||
        installationId == null ||
        installationId.isEmpty) {
      _resetVerification();
      return;
    }

    final sim = _verificationSim;

    setState(() {
      _busy = true;
    });

    try {
      final result = await _verificationClient.start(
        phone: phone,
        installationId: installationId,
        simIccid: _simIccid(sim),
      );

      if (mounted == false) {
        return;
      }

      _otpController.clear();

      setState(() {
        _challengeToken = result.challengeToken;

        _busy = false;
      });

      _startResendCountdown();
    } on DioException catch (error) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _busy = false;
      });

      _showError(
        _dioMessage(
          error,
          'AgentPro could not resend the verification code.',
        ),
      );
    } catch (_) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _busy = false;
      });

      _showError(
        'AgentPro could not resend the verification code.',
      );
    }
  }

  Future<void> _verifyAndEnable() async {
    if (_busy) {
      return;
    }

    final code = _otpController.text.trim();

    if (RegExp(
          r'^\d{6}$',
        ).hasMatch(code) ==
        false) {
      _showError(
        'Enter the 6-digit verification code.',
      );
      return;
    }

    final challenge = _challengeToken;

    final phone = _verificationPhone;

    final installationId = _verificationInstallationId;

    if (challenge == null ||
        challenge.isEmpty ||
        phone == null ||
        phone.isEmpty ||
        installationId == null ||
        installationId.isEmpty) {
      _showError(
        'Your verification request has expired. '
        'Request a new code.',
      );

      _resetVerification();
      return;
    }

    final sim = _verificationSim;

    setState(() {
      _busy = true;
    });

    try {
      final verified = await _verificationClient.verify(
        challengeToken: challenge,
        code: code,
        phone: phone,
        installationId: installationId,
        simIccid: _simIccid(sim),
      );

      final response = await ApiClient.instance.post(
        '/auth/add-personal-capability',
        data: {
          'phone_verification_token': verified.verificationToken,
          'installation_id': installationId,
          if (_simIccid(sim) != null) 'sim_iccid': _simIccid(sim),
        },
      );

      final rawData = response.data['data'];

      if ((rawData is Map) == false) {
        throw const FormatException(
          'Personal capability response is malformed.',
        );
      }

      final data = Map<String, dynamic>.from(
        rawData as Map,
      );

      if (mounted == false) {
        return;
      }

      _resendTimer?.cancel();
      _otpController.clear();

      context.read<AuthBloc>().add(
            AuthUpdateUserEvent({
              'personal_subscription_plan': data['personal_subscription_plan'],
              'personal_subscription_expires_at':
                  data['personal_subscription_expires_at'],
            }),
          );

      context.pop();
    } on DioException catch (error) {
      if (mounted == false) {
        return;
      }

      _resetVerification();

      _showError(
        _dioMessage(
          error,
          'AgentPro could not enable Personal Mode. '
          'Verify your phone again and retry.',
        ),
      );
    } on FormatException {
      if (mounted == false) {
        return;
      }

      _resetVerification();

      _showError(
        'AgentPro received an invalid Personal account response.',
      );
    } catch (_) {
      if (mounted == false) {
        return;
      }

      _resetVerification();

      _showError(
        'AgentPro could not enable Personal Mode. '
        'Verify your phone again and retry.',
      );
    }
  }

  void _startResendCountdown() {
    _resendTimer?.cancel();

    if (mounted == false) {
      return;
    }

    setState(() {
      _resendSeconds = 60;
    });

    _resendTimer = Timer.periodic(
      const Duration(seconds: 1),
      (timer) {
        if (mounted == false) {
          timer.cancel();
          return;
        }

        if (_resendSeconds <= 1) {
          timer.cancel();

          setState(() {
            _resendSeconds = 0;
          });

          return;
        }

        setState(() {
          _resendSeconds -= 1;
        });
      },
    );
  }

  void _resetVerification() {
    _resendTimer?.cancel();
    _otpController.clear();

    if (mounted == false) {
      return;
    }

    setState(() {
      _step = _CapabilityStep.identity;

      _challengeToken = null;

      _verificationPhone = null;

      _verificationInstallationId = null;

      _verificationSim = null;

      _busy = false;

      _resendSeconds = 0;
    });
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    _otpController.dispose();

    super.dispose();
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Add Personal Account',
        ),
        leading: BackButton(
          onPressed: () {
            if (_step == _CapabilityStep.verification) {
              _resetVerification();
              return;
            }

            context.pop();
          },
        ),
      ),
      body: _step == _CapabilityStep.identity
          ? _buildIdentityStep(
              context,
            )
          : _buildVerificationStep(
              context,
            ),
    );
  }

  Widget _buildIdentityStep(
    BuildContext context,
  ) {
    final phone = _accountPhone();

    return ListView(
      padding: const EdgeInsets.all(
        20,
      ),
      children: [
        const Icon(
          Icons.person_add_alt_1_outlined,
          size: 52,
          color: AppTheme.primaryColor,
        ),
        const SizedBox(
          height: 14,
        ),
        const Text(
          'Enable Personal Mode',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(
          height: 8,
        ),
        Text(
          'Verify the phone number already registered '
          'on this AgentPro account before Personal Mode is enabled.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: context.appSecondaryText,
            height: 1.4,
          ),
        ),
        const SizedBox(
          height: 20,
        ),
        Container(
          padding: const EdgeInsets.all(
            14,
          ),
          decoration: BoxDecoration(
            color: context.appSurface,
            borderRadius: BorderRadius.circular(
              16,
            ),
            border: Border.all(
              color: context.appSecondaryText.withValues(
                alpha: 0.12,
              ),
            ),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.phone_outlined,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(
                width: 12,
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Account Phone',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(
                      height: 3,
                    ),
                    Text(
                      phone.isEmpty ? 'No phone number available' : phone,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(
          height: 18,
        ),
        _buildSimSelector(
          context,
        ),
        const SizedBox(
          height: 24,
        ),
        AppButton(
          label: 'Send Verification Code',
          onPressed: _loadingIdentity ? null : _requestCode,
          isLoading: _busy || _loadingIdentity,
          icon: Icons.sms_outlined,
        ),
      ],
    );
  }

  Widget _buildSimSelector(
    BuildContext context,
  ) {
    return Container(
      padding: const EdgeInsets.all(
        14,
      ),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(
          16,
        ),
        border: Border.all(
          color: context.appSecondaryText.withValues(
            alpha: 0.12,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.sim_card_outlined,
                color: AppTheme.primaryColor,
              ),
              SizedBox(
                width: 10,
              ),
              Text(
                'Subscriber SIM',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(
            height: 6,
          ),
          Text(
            'Choose the SIM you will use for '
            'your own Subscriber transactions.',
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          const SizedBox(
            height: 12,
          ),
          if (_loadingIdentity)
            const Center(
              child: CircularProgressIndicator(),
            )
          else if (_supportedSims.isEmpty)
            Text(
              _identityWarning ??
                  'No supported SIM was detected. '
                      'Verified-phone and device protection will still apply.',
              style: TextStyle(
                color: context.appSecondaryText,
                fontSize: 11.5,
                height: 1.35,
              ),
            )
          else
            for (final sim in _supportedSims)
              Padding(
                padding: const EdgeInsets.only(
                  bottom: 8,
                ),
                child: _buildSimOption(
                  context,
                  sim,
                ),
              ),
        ],
      ),
    );
  }

  Widget _buildSimOption(
    BuildContext context,
    SimCard sim,
  ) {
    final selected = _selectedSim?.slot == sim.slot &&
        _selectedSim?.subscriptionId == sim.subscriptionId;

    return InkWell(
      key: ValueKey(
        'add-personal-sim-${sim.slot}-${sim.subscriptionId}',
      ),
      onTap: () {
        setState(() {
          _selectedSim = sim;
        });
      },
      borderRadius: BorderRadius.circular(
        12,
      ),
      child: Container(
        padding: const EdgeInsets.all(
          12,
        ),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(
            12,
          ),
          border: Border.all(
            color: selected
                ? AppTheme.primaryColor
                : context.appSecondaryText.withValues(
                    alpha: 0.12,
                  ),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.sim_card,
              color: AppTheme.providerColor(
                sim.network,
              ),
            ),
            const SizedBox(
              width: 10,
            ),
            Expanded(
              child: Text(
                _simLabel(
                  sim,
                ),
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color:
                  selected ? AppTheme.primaryColor : context.appSecondaryText,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVerificationStep(
    BuildContext context,
  ) {
    final phone = _verificationPhone ?? '';

    final sim = _verificationSim;

    return ListView(
      padding: const EdgeInsets.all(
        20,
      ),
      children: [
        const Icon(
          Icons.verified_user_outlined,
          size: 52,
          color: AppTheme.primaryColor,
        ),
        const SizedBox(
          height: 14,
        ),
        const Text(
          'Verify Account Phone',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(
          height: 8,
        ),
        Text(
          'Enter the 6-digit code sent to '
          '${_maskedPhone(phone)}.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: context.appSecondaryText,
          ),
        ),
        if (sim != null) ...[
          const SizedBox(
            height: 8,
          ),
          Text(
            '${_simLabel(sim)} • Subscriber SIM',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppTheme.primaryColor,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ],
        const SizedBox(
          height: 28,
        ),
        TextFormField(
          key: const ValueKey(
            'add-personal-phone-otp',
          ),
          controller: _otpController,
          maxLength: 6,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          textAlign: TextAlign.center,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
          ],
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w700,
            letterSpacing: 8,
          ),
          decoration: const InputDecoration(
            labelText: 'Verification Code',
            counterText: '',
            hintText: '000000',
            prefixIcon: Icon(
              Icons.lock_clock_outlined,
            ),
          ),
          onFieldSubmitted: (_) {
            _verifyAndEnable();
          },
        ),
        const SizedBox(
          height: 20,
        ),
        AppButton(
          label: 'Verify & Enable Personal Mode',
          onPressed: _verifyAndEnable,
          isLoading: _busy,
          icon: Icons.person_add_alt_1,
        ),
        const SizedBox(
          height: 12,
        ),
        TextButton(
          onPressed: _busy || _resendSeconds > 0 ? null : _resendCode,
          child: Text(
            _resendSeconds > 0
                ? 'Send new code in ${_resendSeconds}s'
                : 'Send a new code',
          ),
        ),
        TextButton.icon(
          onPressed: _busy ? null : _resetVerification,
          icon: const Icon(
            Icons.arrow_back,
          ),
          label: const Text(
            'Change SIM',
          ),
        ),
      ],
    );
  }
}
