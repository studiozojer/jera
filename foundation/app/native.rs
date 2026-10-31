// The same Snapback device protocol as the web, hosted natively in SQLite.
// Kept separate from Exact's generated host glue. Native builds remain unverified.
struct Snapback(exact_snapback4::Module);
impl exact_js::NativeModule for Snapback {
    fn configure_storage(
        &mut self,
        data: std::path::PathBuf,
        cache: std::path::PathBuf,
        temporary: std::path::PathBuf,
    ) -> Result<(), String> {
        self.0.configure_storage(data, cache, temporary)
    }
    fn call(&mut self, request: &serde_json::Value) -> Result<serde_json::Value, String> {
        self.0.call(request)
    }
}
fn snapback(_source: &str) -> Box<dyn exact_js::NativeModule> {
    Box::new(Snapback(exact_snapback4::Module::new(APP, GRANTS)
        .expect("Snapback uses Jera's baked identity and grants")))
}
