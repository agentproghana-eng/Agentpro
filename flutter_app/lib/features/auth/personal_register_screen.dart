import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_bloc.dart';
import '../../core/auth/personal_phone_verification_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/storage_service.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

enum _PersonalRegistrationStep {
  details,
  verification,
}

class PersonalRegisterScreen extends StatefulWidget {
  const PersonalRegisterScreen({
    super.key,
  });

  @override
  State<PersonalRegisterScreen> createState() => _PersonalRegisterScreenState();
}

class _PersonalRegisterScreenState extends State<PersonalRegisterScreen> {
  final _formKey = GlobalKey<FormState>();

  final _firstNameCtrl = TextEditingController();

  final _lastNameCtrl = TextEditingController();

  final _emailCtrl = TextEditingController();

  final _phoneCtrl = TextEditingController();

  final _passwordCtrl = TextEditingController();

  final _confirmCtrl = TextEditingController();

  final _otpCtrl = TextEditingController();

  final _verificationClient = PersonalPhoneVerificationClient();

  _PersonalRegistrationStep _step = _PersonalRegistrationStep.details;

  List<SimCard> _supportedSims = const [];

  SimCard? _selectedSim;
  SimCard? _verificationSim;

  String? _installationId;
  String? _verificationInstallationId;
  String? _verificationPhone;
  String? _challengeToken;
  String? _identityWarning;

  bool _loadingIdentity = true;
  bool _verificationBusy = false;
  bool _registrationDispatched = false;

  bool _obscure = true;
  bool _obscureConfirm = true;

  int _resendSeconds = 0;

  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _loadRegistrationIdentity();
  }

  Future<void> _loadRegistrationIdentity() async {
    String? installationId;
    String? warning;

    List<SimCard> supported = const [];

    try {
      installationId = await StorageService.getOrCreateInstallationId();
    } catch (_) {
      warning = 'AgentPro could not prepare this device identity. '
          'Try again before requesting a verification code.';
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
          'You can still verify your phone number, '
          'but SIM identity protection is unavailable.';
    } catch (_) {
      warning = 'AgentPro could not read SIM information. '
          'Phone verification can still continue.';
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
    final value = phone.trim();

    if (value.length <= 4) {
      return value;
    }

    final hidden = List<String>.filled(
      value.length - 4,
      '•',
    ).join();

    return '$hidden${value.substring(value.length - 4)}';
  }

  void _showMessage(
    String message, {
    bool error = true,
  }) {
    if (mounted == false) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: error ? AppTheme.errorColor : AppTheme.primaryColor,
        ),
      );
  }

  String _dioMessage(
    DioException error,
    String fallback,
  ) {
    final responseData = error.response?.data;

    if (responseData is Map) {
      final message = responseData['message'];

      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }

    return fallback;
  }

  Future<void> _requestCode() async {
    final form = _formKey.currentState;

    if (form == null || form.validate() == false) {
      return;
    }

    if (_loadingIdentity) {
      return;
    }

    if (_supportedSims.length > 1 && _selectedSim == null) {
      _showMessage(
        'Choose the SIM you will use as your Subscriber SIM.',
      );
      return;
    }

    final installationId = _installationId;

    if (installationId == null || installationId.trim().isEmpty) {
      _showMessage(
        'AgentPro could not prepare this device identity. '
        'Try loading the registration screen again.',
      );
      return;
    }

    final phone = _phoneCtrl.text.trim();

    final sim = _selectedSim;

    setState(() {
      _verificationBusy = true;
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

      _otpCtrl.clear();

      setState(() {
        _challengeToken = result.challengeToken;

        _verificationPhone = phone;

        _verificationInstallationId = installationId;

        _verificationSim = sim;

        _step = _PersonalRegistrationStep.verification;

        _verificationBusy = false;

        _registrationDispatched = false;
      });

      _startResendCountdown();
    } on DioException catch (error) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _verificationBusy = false;
      });

      _showMessage(
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
        _verificationBusy = false;
      });

      _showMessage(
        'AgentPro received an invalid verification response.',
      );
    } catch (_) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _verificationBusy = false;
      });

      _showMessage(
        'AgentPro could not send the verification code.',
      );
    }
  }

  Future<void> _resendCode() async {
    if (_verificationBusy || _resendSeconds > 0) {
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
      _verificationBusy = true;
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

      _otpCtrl.clear();

      setState(() {
        _challengeToken = result.challengeToken;

        _verificationBusy = false;
      });

      _startResendCountdown();

      _showMessage(
        'A new verification code was sent.',
        error: false,
      );
    } on DioException catch (error) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _verificationBusy = false;
      });

      _showMessage(
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
        _verificationBusy = false;
      });

      _showMessage(
        'AgentPro could not resend the verification code.',
      );
    }
  }

  Future<void> _verifyAndRegister() async {
    if (_verificationBusy) {
      return;
    }

    final code = _otpCtrl.text.trim();

    if (RegExp(
          r'^\d{6}$',
        ).hasMatch(code) ==
        false) {
      _showMessage(
        'Enter the 6-digit verification code.',
      );
      return;
    }

    final challengeToken = _challengeToken;

    final phone = _verificationPhone;

    final installationId = _verificationInstallationId;

    if (challengeToken == null ||
        challengeToken.isEmpty ||
        phone == null ||
        phone.isEmpty ||
        installationId == null ||
        installationId.isEmpty) {
      _showMessage(
        'Your verification request has expired. '
        'Request a new code.',
      );

      _resetVerification();
      return;
    }

    final sim = _verificationSim;

    setState(() {
      _verificationBusy = true;
    });

    try {
      final result = await _verificationClient.verify(
        challengeToken: challengeToken,
        code: code,
        phone: phone,
        installationId: installationId,
        simIccid: _simIccid(sim),
      );

      if (mounted == false) {
        return;
      }

      _resendTimer?.cancel();
      _otpCtrl.clear();

      setState(() {
        _verificationBusy = false;

        _registrationDispatched = true;

        _challengeToken = null;

        _resendSeconds = 0;
      });

      context.read<AuthBloc>().add(
            AuthRegisterPersonalEvent(
              firstName: _firstNameCtrl.text.trim(),
              lastName: _lastNameCtrl.text.trim(),
              email: _emailCtrl.text.trim(),
              phone: phone,
              password: _passwordCtrl.text,
              phoneVerificationToken: result.verificationToken,
              installationId: installationId,
              simIccid: _simIccid(sim),
            ),
          );
    } on DioException catch (error) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _verificationBusy = false;
      });

      _showMessage(
        _dioMessage(
          error,
          'The verification code could not be confirmed.',
        ),
      );
    } on FormatException {
      if (mounted == false) {
        return;
      }

      setState(() {
        _verificationBusy = false;
      });

      _showMessage(
        'AgentPro received an invalid verification response.',
      );
    } catch (_) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _verificationBusy = false;
      });

      _showMessage(
        'The verification code could not be confirmed.',
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
    _otpCtrl.clear();

    if (mounted == false) {
      return;
    }

    setState(() {
      _step = _PersonalRegistrationStep.details;

      _challengeToken = null;

      _verificationPhone = null;

      _verificationInstallationId = null;

      _verificationSim = null;

      _verificationBusy = false;

      _registrationDispatched = false;

      _resendSeconds = 0;
    });
  }

  @override
  void dispose() {
    _resendTimer?.cancel();

    for (final controller in [
      _firstNameCtrl,
      _lastNameCtrl,
      _emailCtrl,
      _phoneCtrl,
      _passwordCtrl,
      _confirmCtrl,
      _otpCtrl,
    ]) {
      controller.dispose();
    }

    super.dispose();
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return BlocListener<AuthBloc, AuthState>(
      listener: (
        context,
        state,
      ) {
        if (state is AuthError) {
          if (_registrationDispatched) {
            _resetVerification();
          }

          _showMessage(
            state.message,
          );
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'Personal Account',
          ),
          leading: BackButton(
            onPressed: () {
              if (_step == _PersonalRegistrationStep.verification) {
                _resetVerification();
                return;
              }

              context.pop();
            },
          ),
        ),
        body: BlocBuilder<AuthBloc, AuthState>(
          builder: (
            context,
            state,
          ) {
            final authLoading = state is AuthLoading;

            return _step == _PersonalRegistrationStep.details
                ? _buildDetails(
                    context,
                    authLoading,
                  )
                : _buildVerification(
                    context,
                    authLoading,
                  );
          },
        ),
      ),
    );
  }

  Widget _buildDetails(
    BuildContext context,
    bool authLoading,
  ) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(
          20,
        ),
        children: [
          const Text(
            'Create your Personal account',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(
            height: 4,
          ),
          Text(
            'Verify your mobile number before the account is created. '
            'Your free trial is granted only once per verified identity.',
            style: TextStyle(
              fontSize: 12,
              color: context.appSecondaryText,
              height: 1.4,
            ),
          ),
          const SizedBox(
            height: 20,
          ),
          Row(
            children: [
              Expanded(
                child: AppTextField(
                  controller: _firstNameCtrl,
                  label: 'First Name',
                  validator: (value) {
                    final text = value?.trim() ?? '';

                    return text.isEmpty ? 'Required' : null;
                  },
                ),
              ),
              const SizedBox(
                width: 12,
              ),
              Expanded(
                child: AppTextField(
                  controller: _lastNameCtrl,
                  label: 'Last Name',
                  validator: (value) {
                    final text = value?.trim() ?? '';

                    return text.isEmpty ? 'Required' : null;
                  },
                ),
              ),
            ],
          ),
          const SizedBox(
            height: 14,
          ),
          AppTextField(
            controller: _emailCtrl,
            label: 'Email Address',
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.email_outlined,
            validator: (value) {
              final text = value?.trim() ?? '';

              return text.contains(
                '@',
              )
                  ? null
                  : 'Enter a valid email';
            },
          ),
          const SizedBox(
            height: 14,
          ),
          AppTextField(
            controller: _phoneCtrl,
            label: 'Phone Number',
            keyboardType: TextInputType.phone,
            prefixIcon: Icons.phone_outlined,
            validator: (value) {
              final text = value?.trim() ?? '';

              return text.isEmpty ? 'Required' : null;
            },
          ),
          const SizedBox(
            height: 18,
          ),
          _buildSubscriberSimSelector(
            context,
          ),
          const SizedBox(
            height: 18,
          ),
          AppTextField(
            controller: _passwordCtrl,
            label: 'Password',
            obscureText: _obscure,
            prefixIcon: Icons.lock_outline,
            suffixIcon: IconButton(
              icon: Icon(
                _obscure
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
              onPressed: () {
                setState(() {
                  _obscure = _obscure == false;
                });
              },
            ),
            validator: (value) {
              final text = value ?? '';

              if (text.length < 8) {
                return 'Min 8 characters';
              }

              if (text.contains(
                    RegExp(
                      r'[A-Z]',
                    ),
                  ) ==
                  false) {
                return 'Include an uppercase letter';
              }

              if (text.contains(
                    RegExp(
                      r'[0-9]',
                    ),
                  ) ==
                  false) {
                return 'Include a number';
              }

              return null;
            },
          ),
          const SizedBox(
            height: 14,
          ),
          AppTextField(
            controller: _confirmCtrl,
            label: 'Confirm Password',
            obscureText: _obscureConfirm,
            prefixIcon: Icons.lock_outline,
            suffixIcon: IconButton(
              icon: Icon(
                _obscureConfirm
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
              onPressed: () {
                setState(() {
                  _obscureConfirm = _obscureConfirm == false;
                });
              },
            ),
            validator: (value) {
              final text = value ?? '';

              return text == _passwordCtrl.text
                  ? null
                  : 'Passwords do not match';
            },
          ),
          const SizedBox(
            height: 24,
          ),
          AppButton(
            label: 'Send Verification Code',
            onPressed: _loadingIdentity ? null : _requestCode,
            isLoading: _verificationBusy || authLoading || _loadingIdentity,
            icon: Icons.sms_outlined,
          ),
        ],
      ),
    );
  }

  Widget _buildSubscriberSimSelector(
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
              Expanded(
                child: Text(
                  'Subscriber SIM',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(
            height: 6,
          ),
          Text(
            'Choose the SIM you will use for your normal '
            'Subscriber transactions.',
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
              child: Padding(
                padding: EdgeInsets.all(
                  10,
                ),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_supportedSims.isEmpty)
            _buildIdentityNotice(
              context,
              _identityWarning ??
                  'No supported SIM was detected. '
                      'You can continue with verified-phone protection.',
            )
          else ...[
            for (final sim in _supportedSims) ...[
              _buildSimOption(
                context,
                sim,
              ),
              if (sim == _supportedSims.last)
                const SizedBox.shrink()
              else
                const SizedBox(
                  height: 8,
                ),
            ],
          ],
          if (_identityWarning != null && _supportedSims.isNotEmpty) ...[
            const SizedBox(
              height: 10,
            ),
            _buildIdentityNotice(
              context,
              _identityWarning ?? '',
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildIdentityNotice(
    BuildContext context,
    String message,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(
        10,
      ),
      decoration: BoxDecoration(
        color: context.appTileColor(
          const Color(
            0xFFFFF7E6,
          ),
        ),
        borderRadius: BorderRadius.circular(
          10,
        ),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: context.appSecondaryText,
          fontSize: 11.5,
          height: 1.35,
        ),
      ),
    );
  }

  Widget _buildSimOption(
    BuildContext context,
    SimCard sim,
  ) {
    final selected = _selectedSim?.slot == sim.slot &&
        _selectedSim?.subscriptionId == sim.subscriptionId;

    final hasIccid = _simIccid(sim) != null;

    return InkWell(
      key: ValueKey(
        'personal-subscriber-sim-${sim.slot}-${sim.subscriptionId}',
      ),
      onTap: () {
        setState(() {
          _selectedSim = sim;
        });
      },
      borderRadius: BorderRadius.circular(
        12,
      ),
      child: AnimatedContainer(
        duration: const Duration(
          milliseconds: 160,
        ),
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
          color: selected
              ? AppTheme.primaryColor.withValues(
                  alpha: 0.06,
                )
              : Colors.transparent,
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _simLabel(
                      sim,
                    ),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(
                    height: 2,
                  ),
                  Text(
                    hasIccid
                        ? 'Physical SIM identity available'
                        : 'SIM identity unavailable on this Android device',
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(
              width: 8,
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

  Widget _buildVerification(
    BuildContext context,
    bool authLoading,
  ) {
    final phone = _verificationPhone ?? '';

    final sim = _verificationSim;

    return ListView(
      padding: const EdgeInsets.all(
        20,
      ),
      children: [
        const Icon(
          Icons.mark_email_read_outlined,
          size: 52,
          color: AppTheme.primaryColor,
        ),
        const SizedBox(
          height: 16,
        ),
        const Text(
          'Verify your phone number',
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
            height: 1.4,
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
            'personal-phone-otp-field',
          ),
          controller: _otpCtrl,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          textAlign: TextAlign.center,
          maxLength: 6,
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
            hintText: '000000',
            counterText: '',
            prefixIcon: Icon(
              Icons.lock_clock_outlined,
            ),
          ),
          onFieldSubmitted: (_) {
            _verifyAndRegister();
          },
        ),
        const SizedBox(
          height: 20,
        ),
        AppButton(
          label: 'Verify & Create Account',
          onPressed: _verifyAndRegister,
          isLoading: _verificationBusy || authLoading,
          icon: Icons.verified_user_outlined,
        ),
        const SizedBox(
          height: 12,
        ),
        TextButton(
          onPressed:
              _verificationBusy || _resendSeconds > 0 ? null : _resendCode,
          child: Text(
            _resendSeconds > 0
                ? 'Send new code in ${_resendSeconds}s'
                : 'Send a new code',
          ),
        ),
        const SizedBox(
          height: 4,
        ),
        TextButton.icon(
          onPressed: _verificationBusy ? null : _resetVerification,
          icon: const Icon(
            Icons.arrow_back,
          ),
          label: const Text(
            'Change phone or SIM',
          ),
        ),
      ],
    );
  }
}
