# Diagnose Before Fixing

When something breaks (CI failure, runtime error, performance issue):

1. **Reproduce and isolate first.** Find the smallest input that triggers the problem. Don't touch config or infrastructure until you know the root cause.
2. **Ask "is this one thing broken, or many things?"** Use binary search — cut the problem space in half, not shotgun fixes.
3. **Trust the baseline.** If other PRs / branches work fine, the problem is in YOUR changes, not the infrastructure. Narrow to what changed.
4. **One variable at a time.** Don't change the test framework, pool config, and CI structure in the same commit. You won't know which one helped.
