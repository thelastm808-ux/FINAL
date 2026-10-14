using Sbroenne.WindowsMcp.Input;
using Sbroenne.WindowsMcp.Models;

namespace Sbroenne.WindowsMcp.Tests.Unit;

public class CoordinateNormalizerTests
{
    /// <summary>
    /// Test data for coordinate normalization on a single primary monitor.
    /// </summary>
    public static TheoryData<int, int, ScreenBounds, int, int> SingleMonitorTestData => new()
    {
        // Origin (0,0) on 1920x1080 monitor -> should be 0,0
        { 0, 0, new ScreenBounds(0, 0, 1920, 1080), 0, 0 },

        // Center of 1920x1080 monitor -> should be approximately 32767,32767
        { 960, 540, new ScreenBounds(0, 0, 1920, 1080), 32768, 32768 },

        // Bottom-right corner of 1920x1080 -> should be 65535,65535
        { 1919, 1079, new ScreenBounds(0, 0, 1920, 1080), 65501, 65475 },

        // Arbitrary position on 1920x1080
        { 500, 300, new ScreenBounds(0, 0, 1920, 1080), 17067, 18204 },
    };

    /// <summary>
    /// Test data for multi-monitor setups with negative coordinates.
    /// </summary>
    public static TheoryData<int, int, ScreenBounds, int, int> MultiMonitorTestData => new()
    {
        // Left monitor at -1920,0, right monitor at 0,0 (both 1920x1080)
        // Virtual desktop: (-1920, 0) to (1920, 1080), width=3840, height=1080
        // Coordinate (-1920, 0) should normalize to (0, 0)
        { -1920, 0, new ScreenBounds(-1920, 0, 3840, 1080), 0, 0 },

        // Coordinate (0, 0) on the combined desktop should be mid-x
        { 0, 0, new ScreenBounds(-1920, 0, 3840, 1080), 32768, 0 },

        // Right edge of right monitor
        { 1919, 1079, new ScreenBounds(-1920, 0, 3840, 1080), 65518, 65475 },

        // Center of left monitor (-960, 540)
        { -960, 540, new ScreenBounds(-1920, 0, 3840, 1080), 16384, 32768 },
    };

    /// <summary>
    /// Test data for monitor above primary (negative Y coordinates).
    /// </summary>
    public static TheoryData<int, int, ScreenBounds, int, int> VerticalMultiMonitorTestData => new()
    {
        // Top monitor at (0, -1080), bottom at (0, 0), both 1920x1080
        // Virtual desktop: (0, -1080) to (1920, 1080), width=1920, height=2160
        // Coordinate (0, -1080) should normalize to (0, 0)
        { 0, -1080, new ScreenBounds(0, -1080, 1920, 2160), 0, 0 },

        // Coordinate (0, 0) - boundary between monitors
        { 0, 0, new ScreenBounds(0, -1080, 1920, 2160), 0, 32768 },

        // Bottom-right of bottom monitor
        { 1919, 1079, new ScreenBounds(0, -1080, 1920, 2160), 65501, 65505 },
    };

    [Theory]
    [MemberData(nameof(SingleMonitorTestData))]
    public void Normalize_SingleMonitor_ReturnsExpectedValues(
        int screenX, int screenY, ScreenBounds bounds, int expectedNormalizedX, int expectedNormalizedY)
    {
        // Act
        var (normalizedX, normalizedY) = CoordinateNormalizer.Normalize(screenX, screenY, bounds);

        // Assert - allow 1 unit tolerance due to rounding
        Assert.InRange(normalizedX, expectedNormalizedX - 1, expectedNormalizedX + 1);
        Assert.InRange(normalizedY, expectedNormalizedY - 1, expectedNormalizedY + 1);
    }

    [Theory]
    [MemberData(nameof(MultiMonitorTestData))]
    public void Normalize_MultiMonitorHorizontal_ReturnsExpectedValues(
        int screenX, int screenY, ScreenBounds bounds, int expectedNormalizedX, int expectedNormalizedY)
    {
        // Act
        var (normalizedX, normalizedY) = CoordinateNormalizer.Normalize(screenX, screenY, bounds);

        // Assert - allow 1 unit tolerance due to rounding
        Assert.InRange(normalizedX, expectedNormalizedX - 1, expectedNormalizedX + 1);
        Assert.InRange(normalizedY, expectedNormalizedY - 1, expectedNormalizedY + 1);
    }

    [Theory]
    [MemberData(nameof(VerticalMultiMonitorTestData))]
    public void Normalize_MultiMonitorVertical_ReturnsExpectedValues(
        int screenX, int screenY, ScreenBounds bounds, int expectedNormalizedX, int expectedNormalizedY)
    {
        // Act
        var (normalizedX, normalizedY) = CoordinateNormalizer.Normalize(screenX, screenY, bounds);

        // Assert - allow 1 unit tolerance due to rounding
        Assert.InRange(normalizedX, expectedNormalizedX - 1, expectedNormalizedX + 1);
        Assert.InRange(normalizedY, expectedNormalizedY - 1, expectedNormalizedY + 1);
    }

    [Fact]
    public void Normalize_OutputRange_IsWithin0To65535()
    {
        // Arrange - bounds representing a 4K monitor
        var bounds = new ScreenBounds(0, 0, 3840, 2160);

        // Act - test various edge coordinates
        var originResult = CoordinateNormalizer.Normalize(0, 0, bounds);
        var maxResult = CoordinateNormalizer.Normalize(3839, 2159, bounds);
        var centerResult = CoordinateNormalizer.Normalize(1920, 1080, bounds);

        // Assert - all results should be within valid range
        Assert.InRange(originResult.NormalizedX, 0, 65535);
        Assert.InRange(originResult.NormalizedY, 0, 65535);
        Assert.InRange(maxResult.NormalizedX, 0, 65535);
        Assert.InRange(maxResult.NormalizedY, 0, 65535);
        Assert.InRange(centerResult.NormalizedX, 0, 65535);
        Assert.InRange(centerResult.NormalizedY, 0, 65535);
    }

    [Fact]
    public void ValidateCoordinates_WithinBounds_ReturnsTrue()
    {
        // Arrange - use current virtual screen bounds
        var bounds = CoordinateNormalizer.GetVirtualScreenBounds();

        // Act - test a coordinate we know is within bounds (origin of virtual screen)
        var (isValid, _) = CoordinateNormalizer.ValidateCoordinates(bounds.Left, bounds.Top);

        // Assert
        Assert.True(isValid);
    }

    [Fact]
    public void ValidateCoordinates_OutsideBounds_ReturnsFalse()
    {
        // Arrange - use current virtual screen bounds
        var bounds = CoordinateNormalizer.GetVirtualScreenBounds();

        // Act - test coordinates outside the virtual screen
        var (isValidRight, returnedBounds1) = CoordinateNormalizer.ValidateCoordinates(bounds.Right + 100, bounds.Top);
        var (isValidBottom, returnedBounds2) = CoordinateNormalizer.ValidateCoordinates(bounds.Left, bounds.Bottom + 100);
        var (isValidFarLeft, returnedBounds3) = CoordinateNormalizer.ValidateCoordinates(bounds.Left - 100, bounds.Top);

        // Assert
        Assert.False(isValidRight);
        Assert.False(isValidBottom);
        Assert.False(isValidFarLeft);

        // Verify bounds are returned for error context
        Assert.Equal(bounds, returnedBounds1);
        Assert.Equal(bounds, returnedBounds2);
        Assert.Equal(bounds, returnedBounds3);
    }

    [Fact]
    public void GetVirtualScreenBounds_ReturnsNonZeroDimensions()
    {
        // Act
        var bounds = CoordinateNormalizer.GetVirtualScreenBounds();

        // Assert - width and height should be positive
        Assert.True(bounds.Width > 0, "Virtual screen width should be positive");
        Assert.True(bounds.Height > 0, "Virtual screen height should be positive");
    }
}
