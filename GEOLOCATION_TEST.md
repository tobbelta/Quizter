# Geolocation Test Protocol - Dev Tools Simulation

## Test Objective
Verify that the geolocation system works correctly by simulating natural player movement from an initial position to the game start position, confirming that the timer starts when the player reaches the designated start area.

## Test Setup Requirements
1. Chrome DevTools with geolocation override capability
2. GeoQuest application running on localhost
3. Test game course with defined start position
4. Non-debug mode (normal player experience)

## Test Protocol

### Phase 1: Initial Setup
1. **Open Chrome DevTools**
   - Press F12 or right-click → Inspect
   - Navigate to "Sensors" tab (if not visible: Settings → Experiments → enable "Sensors")
   - If no Sensors tab: Console → Settings (gear icon) → More tools → Sensors

2. **Configure Initial Position**
   - In Sensors tab, select "Custom location"
   - Set initial coordinates OUTSIDE the start area
   - Test coordinates:
     - Initial (Away): 59.3290, 18.0640 (100m south of start area)
     - Target Start: 59.33739180590685, 18.065299987792972 (from test course)
     - Course Finish: 59.33723860329165, 18.06464354309405

### Phase 2: Game Setup
1. **Login as Lagledare (Team Leader)**
   - Navigate to localhost:3000
   - Login with team leader credentials
   - Verify NOT in debug mode (no debug controls visible)

2. **Create and Start Game**
   - Create new game or join existing team
   - Select appropriate course
   - Start the game process
   - Verify game status shows "pending" or "ready"

### Phase 3: Movement Simulation
1. **Monitor Initial State**
   - Note player position on map
   - Verify timer has NOT started yet
   - Check game status and next objective display

2. **Simulate Natural Movement**
   - Gradually change coordinates in DevTools
   - Move in realistic increments (not instant teleportation)
   - Simulate walking speed: ~1.4 m/s (5 km/h)
   - Update position every 2-3 seconds with small coordinate changes

3. **Approach Start Position**
   - Continue updating coordinates toward start area
   - Watch for visual updates on map
   - Monitor player position marker movement

### Phase 4: Verification
1. **Timer Start Verification**
   - Confirm timer starts when entering start area
   - Check GameHeader shows running timer (HH:MM:SS format)
   - Verify game status changes to "started"
   - Note next objective updates appropriately

2. **Position Accuracy**
   - Verify player marker accurately reflects simulated position
   - Check that position updates are responsive
   - Confirm geolocation accuracy within acceptable range

## Expected Results
✅ **PASS Criteria:**
- Player position updates smoothly during simulation
- Timer starts automatically when reaching start area
- Game status transitions correctly
- Next objective display updates appropriately
- No console errors during geolocation updates

❌ **FAIL Criteria:**
- Player position doesn't update during simulation
- Timer fails to start when in start area
- Significant delays in position updates (>30 seconds)
- Console errors related to geolocation
- Game state doesn't transition properly

## Common Issues to Check
1. **Geolocation Permissions**: Ensure browser allows location access
2. **Update Frequency**: Check if position updates occur at regular intervals
3. **Precision Issues**: Verify if start area detection boundaries are appropriate
4. **Network Delays**: Monitor if Firestore updates cause delays
5. **State Synchronization**: Check if all players see position updates

## Test Execution Steps
1. Set initial position in DevTools (outside start area)
2. Login as team leader (non-debug mode)
3. Create and configure game
4. Start game process
5. Gradually simulate movement toward start
6. Monitor timer and game state changes
7. Document any delays or issues
8. Record test results

## Documentation Requirements
- Screenshots of DevTools Sensors tab configuration
- Screen recording of position movement simulation
- Timer start timestamp and coordinates
- Any console errors or warnings
- Performance observations and delays noted

---
**Test Date:** [To be filled during execution]
**Test Environment:** Chrome DevTools + localhost:3000
**Course Used:** [To be specified]
**Results:** [PASS/FAIL with notes]