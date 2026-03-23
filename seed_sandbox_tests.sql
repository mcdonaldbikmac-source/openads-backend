-- Phase 2: System-Seeded Mock Campaigns
-- Execute this after the Alter Table commands

INSERT INTO campaigns (
    advertiser_wallet,
    creative_title,
    ad_type,
    creative_url,
    image_url,
    status,
    budget_wei,
    spend_wei,
    cpm_rate_wei,
    is_test
) VALUES 
(
    '0xMockAdminSandboxWallet1',
    'OpenAds Master Test Banner (320x50)',
    '320x50',
    'https://openads.xyz#tx=sandbox-test-1',
    'https://openads.xyz/icon.png',
    'active',
    '999000000000000000000', -- Infinite Budget
    '0',
    '1000000', -- 1 USDC CPM equivalent
    true
),
(
    '0xMockAdminSandboxWallet1',
    'OpenAds Master Test Popup (300x250)',
    '300x250',
    'https://openads.xyz#tx=sandbox-test-2',
    'https://openads.xyz/icon.png',
    'active',
    '999000000000000000000', -- Infinite Budget
    '0',
    '2000000', -- 2 USDC CPM equivalent
    true
),
(
    '0xMockAdminSandboxWallet1',
    'OpenAds Master Test Floating (64x64)',
    '64x64',
    'https://openads.xyz#tx=sandbox-test-3',
    'https://openads.xyz/icon.png',
    'active',
    '999000000000000000000', -- Infinite Budget
    '0',
    '500000', -- 0.5 USDC CPM equivalent
    true
);
